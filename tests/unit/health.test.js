import { describe, expect, it, vi } from "vitest";

import { aggregateProjectHealth, healthObservation } from "../../lib/health/model.js";
import { observeHttpHealth } from "../../lib/health/providers/http.js";
import { observePostgresHealth } from "../../lib/health/providers/postgres.js";
import {
  observeRailwayHealth,
  railwayStatusHealth,
} from "../../lib/health/providers/railway.js";
import {
  observeVercelHealth,
  vercelStatusHealth,
} from "../../lib/health/providers/vercel.js";
import { observeProjectsHealth } from "../../lib/projects/health-observations.js";
import { railwayExternalId } from "../../lib/railway/index.js";

vi.mock("server-only", () => ({}));

function monitor(overrides = {}) {
  return {
    id: "monitor-1",
    label: "Production",
    monitorType: "http",
    enabled: true,
    affectsProjectHealth: true,
    configuration: { url: "https://example.com/health", method: "GET" },
    resource: null,
    component: null,
    ...overrides,
  };
}

function observation(status, overrides = {}) {
  const healthMonitor = monitor(overrides.monitor);
  return healthObservation({
    monitor: healthMonitor,
    status,
    reason: `${status} reason`,
  });
}

describe("Project Health aggregation", () => {
  it("returns Not monitored when no enabled health-affecting monitors exist", () => {
    expect(aggregateProjectHealth([]).status).toBe("not_monitored");
    expect(
      aggregateProjectHealth([
        observation("down", { monitor: { enabled: false } }),
        observation("down", {
          monitor: { id: "informational", affectsProjectHealth: false },
        }),
      ]).status,
    ).toBe("not_monitored");
  });

  it("returns Healthy when every required monitor is Healthy", () => {
    expect(aggregateProjectHealth([observation("healthy")]).status).toBe(
      "healthy",
    );
    expect(
      aggregateProjectHealth([
        observation("healthy"),
        observation("healthy", { monitor: { id: "monitor-2" } }),
      ]).status,
    ).toBe("healthy");
  });

  it("returns Down when any required resource is conclusively Down", () => {
    expect(
      aggregateProjectHealth([
        observation("healthy"),
        observation("down", { monitor: { id: "database" } }),
      ]).status,
    ).toBe("down");
  });

  it("returns Degraded for transitional or mixed conclusive/unknown state", () => {
    expect(
      aggregateProjectHealth([
        observation("healthy"),
        observation("degraded", { monitor: { id: "building" } }),
      ]).status,
    ).toBe("degraded");
    expect(
      aggregateProjectHealth([
        observation("healthy"),
        observation("unknown", { monitor: { id: "uncertain" } }),
      ]).status,
    ).toBe("degraded");
  });

  it("returns Unknown when every configured relevant monitor is Unknown", () => {
    expect(
      aggregateProjectHealth([
        observation("unknown"),
        observation("unknown", { monitor: { id: "monitor-2" } }),
      ]).status,
    ).toBe("unknown");
  });

  it("ignores non-affecting Desktop evidence while retaining it", () => {
    const desktop = observation("unknown", {
      monitor: {
        id: "desktop",
        affectsProjectHealth: false,
      },
    });
    const website = observation("healthy", {
      monitor: { id: "website" },
    });
    const result = aggregateProjectHealth([desktop, website]);

    expect(result.status).toBe("healthy");
    expect(result.observations).toHaveLength(2);
  });
});

describe("Health provider normalization", () => {
  it("maps Railway success, failure/crash, and transitional states", () => {
    expect(railwayStatusHealth("SUCCESS")).toBe("healthy");
    expect(railwayStatusHealth("ACTIVE")).toBe("healthy");
    expect(railwayStatusHealth("FAILED")).toBe("down");
    expect(railwayStatusHealth("CRASHED")).toBe("down");
    expect(railwayStatusHealth("BUILDING")).toBe("degraded");
  });

  it("normalizes a real Railway latest-deployment response", async () => {
    const railwayMonitor = monitor({
      monitorType: "railway_deployment",
      resource: {
        id: "railway-resource",
        provider: "railway",
        label: "API",
        url: "https://railway.com",
        externalId: railwayExternalId({
          projectId: "project",
          environmentId: "production",
          serviceId: "api",
        }),
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            deployments: {
              edges: [{ node: { id: "deployment", status: "CRASHED" } }],
            },
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      observeRailwayHealth(railwayMonitor, { token: "token", fetchImpl }),
    ).resolves.toMatchObject({ status: "down", provider: "railway" });

    await expect(
      observeRailwayHealth(railwayMonitor, { token: "", fetchImpl }),
    ).resolves.toMatchObject({
      status: "unknown",
      error: { code: "token_missing" },
    });
  });

  it("maps Vercel ready, error, and transitional production states", () => {
    expect(vercelStatusHealth("READY")).toBe("healthy");
    expect(vercelStatusHealth("ERROR")).toBe("down");
    expect(vercelStatusHealth("CANCELED")).toBe("down");
    expect(vercelStatusHealth("BUILDING")).toBe("degraded");
  });

  it("normalizes a Vercel production deployment", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          deployments: [
            {
              uid: "deployment",
              readyState: "READY",
              target: "production",
              created: Date.parse("2026-08-29T10:00:00Z"),
              url: "projectdeck.vercel.app",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await observeVercelHealth(
      monitor({
        monitorType: "vercel_deployment",
        configuration: { projectId: "prj_projectdeck" },
      }),
      { token: "token", fetchImpl },
    );

    expect(result).toMatchObject({ status: "healthy", provider: "vercel" });
    expect(String(fetchImpl.mock.calls[0][0])).toContain("target=production");
  });

  it("treats HTTP 2xx as Healthy and a network timeout as Down", async () => {
    await expect(
      observeHttpHealth(monitor(), {
        fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
      }),
    ).resolves.toMatchObject({ status: "healthy" });

    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    await expect(
      observeHttpHealth(monitor(), {
        fetchImpl: vi.fn().mockRejectedValue(timeout),
      }),
    ).resolves.toMatchObject({ status: "down", error: { code: "timeout" } });
  });

  it("runs PostgreSQL SELECT 1, closes the client, and reports Healthy", async () => {
    const unsafe = vi.fn().mockResolvedValue([{ ok: 1 }]);
    const end = vi.fn().mockResolvedValue(undefined);
    const result = await observePostgresHealth(
      monitor({
        monitorType: "postgres",
        configuration: { connectionEnvVar: "APP_HEALTH_DATABASE_URL" },
      }),
      {
        env: { APP_HEALTH_DATABASE_URL: "postgresql://not-used" },
        createClient: () => ({ unsafe, end }),
      },
    );

    expect(result.status).toBe("healthy");
    expect(unsafe).toHaveBeenCalledWith("SELECT 1 AS ok");
    expect(end).toHaveBeenCalled();
  });

  it("reports a PostgreSQL timeout as Down and missing secret as Unknown", async () => {
    const timeout = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    const postgresMonitor = monitor({
      monitorType: "postgres",
      configuration: { connectionEnvVar: "APP_HEALTH_DATABASE_URL" },
    });
    await expect(
      observePostgresHealth(postgresMonitor, {
        env: { APP_HEALTH_DATABASE_URL: "postgresql://not-used" },
        createClient: () => ({
          unsafe: vi.fn().mockRejectedValue(timeout),
          end: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    ).resolves.toMatchObject({ status: "down", error: { code: "timeout" } });
    await expect(
      observePostgresHealth(postgresMonitor, { env: {} }),
    ).resolves.toMatchObject({
      status: "unknown",
      error: { code: "configuration_missing" },
    });
  });
});

describe("Project Health observation orchestration", () => {
  it("scopes a provider exception and retains component evidence", async () => {
    const project = {
      id: "product",
      phase: { phase: "development" },
      next: { source: "inferred", action: "Keep this Next unchanged" },
      healthMonitors: [
        monitor({
          component: { id: "database", name: "Database" },
          monitorType: "http",
        }),
      ],
    };
    const [observed] = await observeProjectsHealth([project], {
      fetchImpl: vi.fn().mockImplementation(() => {
        throw new Error("provider exploded");
      }),
    });

    expect(observed.phase).toEqual({ phase: "development" });
    expect(observed.next).toEqual({
      source: "inferred",
      action: "Keep this Next unchanged",
    });
    expect(observed.health.status).toBe("down");
    expect(observed.health.observations[0].component.name).toBe("Database");
  });

  it("does not call a disabled monitor", async () => {
    const fetchImpl = vi.fn();
    const [observed] = await observeProjectsHealth(
      [{ id: "project", healthMonitors: [monitor({ enabled: false })] }],
      { fetchImpl },
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(observed.health.status).toBe("not_monitored");
  });

  it("does not double-count a legacy Railway monitor matched by a provider association", async () => {
    const legacyFetch = vi.fn();
    const [observed] = await observeProjectsHealth(
      [{
        id: "project",
        healthMonitors: [monitor({
          monitorType: "railway_deployment",
          resource: {
            id: "legacy",
            provider: "railway",
            externalId: "railway-project:production:web",
            label: "Legacy Web",
            url: "https://railway.com",
          },
        })],
        providerAssociations: [{
          id: "managed",
          providerConnectionId: "connection",
          projectId: "project",
          providerResourceType: "service_environment",
          externalId: "workspace:railway-project:production:web",
          displayName: "ProjectDeck · production · Web",
          enabled: true,
          affectsProjectHealth: true,
          metadata: { projectId: "railway-project", environmentId: "production", serviceId: "web" },
        }],
      }],
      {
        fetchImpl: legacyFetch,
        railwayConnection: {
          connection: { id: "connection", connectionState: "connected" },
          getAccessToken: vi.fn().mockResolvedValue("access"),
          fetchDeploymentState: vi.fn().mockResolvedValue({
            deployments: [{ id: "current", status: "success" }],
            activeDeployment: { id: "current", status: "success" },
          }),
        },
      },
    );

    expect(legacyFetch).not.toHaveBeenCalled();
    expect(observed.health.observations).toHaveLength(1);
    expect(observed.health.observations[0].monitor.providerManaged).toBe(true);
  });
});
