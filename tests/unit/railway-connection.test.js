import { describe, expect, it, vi } from "vitest";

import {
  findAutomaticRailwayAssociations,
} from "../../lib/railway/associations.js";
import {
  flattenRailwayServices,
  selectProductionEnvironment,
} from "../../lib/railway/discovery.js";
import {
  clearRailwayHealthCache,
  observeRailwayConnectionHealth,
  railwayServiceDeploymentHealth,
} from "../../lib/health/providers/railway-connection.js";
import { RailwayProviderError } from "../../lib/railway/index.js";
import { refreshRailwayIntegration } from "../../lib/railway/refresh.js";

vi.mock("server-only", () => ({}));

function discovery(overrides = {}) {
  return {
    workspaces: [{
      id: "workspace",
      name: "Oz",
      projects: [{
        id: "railway-project",
        name: "ProjectDeck",
        environments: [{ id: "production", name: "production" }],
        services: [{ id: "web", name: "Web", sourceRepository: "ozavrahami/projectdeck" }],
      }],
    }],
    ...overrides,
  };
}

function project(id, repository) {
  return {
    id,
    githubRepositories: [{
      provider: "github",
      resourceType: "repository",
      url: `https://github.com/${repository}`,
    }],
  };
}

function association(overrides = {}) {
  return {
    id: "association",
    providerConnectionId: "connection",
    projectId: "projectdeck",
    providerResourceType: "service_environment",
    externalId: "workspace:railway-project:production:web",
    displayName: "ProjectDeck · production · Web",
    enabled: true,
    affectsProjectHealth: true,
    metadata: { projectId: "railway-project", environmentId: "production", serviceId: "web" },
    component: null,
    ...overrides,
  };
}

describe("Railway discovery and association", () => {
  it("discovers multiple projects from one workspace", () => {
    const data = discovery();
    data.workspaces[0].projects.push({
      id: "lifeos",
      name: "LifeOS",
      environments: [{ id: "life-production", name: "production" }],
      services: [{ id: "api", name: "API", sourceRepository: "ozavrahami/lifeos" }],
    });
    expect(flattenRailwayServices(data)).toHaveLength(2);
  });

  it("auto-associates only an exact GitHub source identity", () => {
    const exact = findAutomaticRailwayAssociations(discovery(), [
      project("projectdeck", "OzAvrahami/ProjectDeck"),
      project("lookalike", "OzAvrahami/ProjectDeck-App"),
    ]);
    expect(exact.matches).toHaveLength(1);
    expect(exact.matches[0].project.id).toBe("projectdeck");

    const loose = findAutomaticRailwayAssociations(discovery(), [
      project("lookalike", "OzAvrahami/ProjectDeck-App"),
    ]);
    expect(loose.matches).toHaveLength(0);
  });

  it("leaves ambiguous exact matches for manual mapping", () => {
    const result = findAutomaticRailwayAssociations(discovery(), [
      project("one", "OzAvrahami/ProjectDeck"),
      project("two", "OzAvrahami/ProjectDeck"),
    ]);
    expect(result.matches).toHaveLength(0);
    expect(result.ambiguous).toHaveLength(1);
  });

  it("selects production only when the name is unique", () => {
    expect(selectProductionEnvironment([{ id: "prod", name: "production" }]).status).toBe("selected");
    expect(selectProductionEnvironment([{ id: "a", name: "production" }, { id: "b", name: "Production" }]).status).toBe("ambiguous");
    expect(selectProductionEnvironment([{ id: "preview", name: "preview" }]).status).toBe("unresolved");
  });
});

describe("provider-managed Railway Health", () => {
  it("maps success, failed build with active predecessor, crash, and transitions", () => {
    expect(railwayServiceDeploymentHealth(
      [{ id: "latest", status: "success" }],
      { id: "latest", status: "success" },
    ).status).toBe("healthy");
    const failed = railwayServiceDeploymentHealth(
      [{ id: "failed", status: "failed" }],
      { id: "active", status: "success" },
    );
    expect(failed.status).toBe("degraded");
    expect(failed.evidence.attentionSignal).toBe("latest_deployment_failed");
    expect(railwayServiceDeploymentHealth(
      [{ id: "crash", status: "crashed" }],
      { id: "active", status: "success" },
    ).status).toBe("degraded");
    expect(railwayServiceDeploymentHealth([{ id: "crash", status: "crashed" }]).status).toBe("down");
    expect(railwayServiceDeploymentHealth([{ id: "build", status: "building" }]).status).toBe("degraded");
    expect(railwayServiceDeploymentHealth(
      [{ id: "skipped", status: "skipped" }],
      { id: "active", status: "success" },
    ).status).toBe("healthy");
    expect(railwayServiceDeploymentHealth(
      [{ id: "removed", status: "removed" }],
    ).status).toBe("down");
  });

  it("distinguishes no deployment from provider failure and missing active state", () => {
    expect(railwayServiceDeploymentHealth()).toMatchObject({
      status: "unknown",
      error: { code: "deployment_not_found" },
    });
    expect(railwayServiceDeploymentHealth([
      { id: "latest", status: "success" },
    ])).toMatchObject({
      status: "unknown",
      error: { code: "active_deployment_not_found" },
    });
  });

  it("one connection supplies independent observations to multiple ProjectDeck projects", async () => {
    const projects = [
      { id: "projectdeck", providerAssociations: [association()] },
      { id: "lifeos", providerAssociations: [association({ id: "life-association", projectId: "lifeos", metadata: { projectId: "life", environmentId: "prod", serviceId: "api" } })] },
    ];
    const fetchDeploymentState = vi.fn().mockResolvedValue({ deployments: [{ id: "ok", status: "success" }], activeDeployment: { id: "ok", status: "success" } });
    const result = await observeRailwayConnectionHealth(projects, {
      connection: { id: "connection", connectionState: "connected" },
      getAccessToken: vi.fn().mockResolvedValue("access"),
      fetchDeploymentState,
    });
    expect(result).toHaveLength(2);
    expect(result.every(({ observation }) => observation.status === "healthy")).toBe(true);
    expect(fetchDeploymentState).toHaveBeenCalledTimes(2);
  });

  it("uses the refreshed OAuth access token for deployment reads", async () => {
    const getAccessToken = vi.fn().mockResolvedValue("refreshed-access");
    const fetchDeploymentState = vi.fn().mockResolvedValue({
      deployments: [{ id: "ok", status: "success" }],
      activeDeployment: { id: "ok", status: "success" },
    });
    await observeRailwayConnectionHealth(
      [{ id: "projectdeck", providerAssociations: [association()] }],
      {
        connection: { id: "connection", connectionState: "connected" },
        getAccessToken,
        fetchDeploymentState,
      },
    );
    expect(getAccessToken).toHaveBeenCalledWith("connection", {
      fetchImpl: expect.any(Function),
    });
    expect(fetchDeploymentState).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: "web" }),
      expect.objectContaining({ token: "refreshed-access" }),
    );
  });

  it("scopes one bad Service observation and retains informational Health impact", async () => {
    const projects = [{
      id: "projectdeck",
      providerAssociations: [
        association(),
        association({ id: "secondary", externalId: "w:p:e:s2", affectsProjectHealth: false, metadata: { projectId: "p", environmentId: "e", serviceId: "s2" } }),
      ],
    }];
    const fetchDeploymentState = vi.fn()
      .mockRejectedValueOnce(new Error("bad service"))
      .mockResolvedValueOnce({ deployments: [{ id: "ok", status: "success" }], activeDeployment: { id: "ok", status: "success" } });
    const result = await observeRailwayConnectionHealth(projects, {
      connection: { id: "connection", connectionState: "connected" },
      getAccessToken: vi.fn().mockResolvedValue("access"),
      fetchDeploymentState,
    });
    expect(result[0].observation.status).toBe("unknown");
    expect(result[1].observation.status).toBe("healthy");
    expect(result[1].observation.monitor.affectsProjectHealth).toBe(false);
  });

  it("reports provider unavailability as Unknown without changing Phase or Next", async () => {
    const input = { id: "projectdeck", phase: { phase: "development" }, next: { action: "Ship" }, providerAssociations: [association()] };
    const result = await observeRailwayConnectionHealth([input], { connection: null });
    expect(result[0].observation.status).toBe("unknown");
    expect(input.phase.phase).toBe("development");
    expect(input.next.action).toBe("Ship");
  });

  it("retains a deployment GraphQL failure classification", async () => {
    const error = new RailwayProviderError(
      "graphql",
      "Railway query failed.",
      {
        status: 400,
        operationName: "RecentDeployments",
        graphqlErrors: [{ code: "GRAPHQL_VALIDATION_FAILED" }],
      },
    );
    const [result] = await observeRailwayConnectionHealth(
      [{ id: "projectdeck", providerAssociations: [association()] }],
      {
        connection: { id: "connection", connectionState: "connected" },
        getAccessToken: vi.fn().mockResolvedValue("access"),
        fetchDeploymentState: vi.fn().mockRejectedValue(error),
      },
    );
    expect(result.observation).toMatchObject({
      status: "unknown",
      error: { code: "deployment_query_failed" },
      evidence: {
        operationName: "RecentDeployments",
        providerStatus: 400,
        providerCodes: ["GRAPHQL_VALIDATION_FAILED"],
      },
    });
  });

  it("rejects an association whose service ID is absent from discovery", async () => {
    const fetchDeploymentState = vi.fn();
    const [result] = await observeRailwayConnectionHealth(
      [{
        id: "projectdeck",
        providerAssociations: [association({
          metadata: {
            projectId: "railway-project",
            environmentId: "production",
            serviceId: "missing-service",
          },
        })],
      }],
      {
        connection: {
          id: "connection",
          connectionState: "connected",
          displayMetadata: discovery(),
        },
        getAccessToken: vi.fn().mockResolvedValue("access"),
        fetchDeploymentState,
      },
    );
    expect(result.observation).toMatchObject({
      status: "unknown",
      error: { code: "invalid_association" },
    });
    expect(fetchDeploymentState).not.toHaveBeenCalled();
  });

  it("keeps an active-deployment partial response scoped and explicit", async () => {
    const [result] = await observeRailwayConnectionHealth(
      [{ id: "projectdeck", providerAssociations: [association()] }],
      {
        connection: { id: "connection", connectionState: "connected" },
        getAccessToken: vi.fn().mockResolvedValue("access"),
        fetchDeploymentState: vi.fn().mockResolvedValue({
          deployments: [{ id: "latest", status: "success" }],
          activeDeployment: null,
          partialError: {
            code: "graphql",
            operationName: "ActiveDeployments",
          },
        }),
      },
    );
    expect(result.observation).toMatchObject({
      status: "unknown",
      error: { code: "provider_partial" },
      evidence: { code: "provider_partial" },
    });
  });

  it("does not cache query exceptions and expires cached Unknown normally", async () => {
    const cache = new Map();
    let currentTime = 1_000;
    const fetchDeploymentState = vi.fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ deployments: [], activeDeployment: null })
      .mockResolvedValueOnce({
        deployments: [{ id: "ok", status: "success" }],
        activeDeployment: { id: "ok", status: "success" },
      });
    const options = {
      connection: { id: "connection", connectionState: "connected" },
      getAccessToken: vi.fn().mockResolvedValue("access"),
      fetchDeploymentState,
      cache,
      cacheEnabled: true,
      now: () => currentTime,
    };
    const projects = [{ id: "projectdeck", providerAssociations: [association()] }];

    expect((await observeRailwayConnectionHealth(projects, options))[0].observation.error.code).toBe("provider_failed");
    expect(cache.size).toBe(0);
    expect((await observeRailwayConnectionHealth(projects, options))[0].observation.error.code).toBe("deployment_not_found");
    expect(fetchDeploymentState).toHaveBeenCalledTimes(2);
    await observeRailwayConnectionHealth(projects, options);
    expect(fetchDeploymentState).toHaveBeenCalledTimes(2);
    currentTime += 45_001;
    expect((await observeRailwayConnectionHealth(projects, options))[0].observation.status).toBe("healthy");
    expect(fetchDeploymentState).toHaveBeenCalledTimes(3);
  });

  it("supports explicit cache invalidation", async () => {
    const cache = new Map([["entry", { result: {}, expiresAt: Infinity }]]);
    clearRailwayHealthCache(cache);
    expect(cache.size).toBe(0);
  });

  it("clears deployment evidence after explicit provider refresh", async () => {
    const refreshDiscovery = vi.fn().mockResolvedValue({ discovery: true });
    const clearHealthCache = vi.fn();
    await expect(refreshRailwayIntegration({
      refreshDiscovery,
      clearHealthCache,
    })).resolves.toEqual({ discovery: true });
    expect(clearHealthCache).toHaveBeenCalledOnce();
    expect(clearHealthCache.mock.invocationCallOrder[0]).toBeLessThan(
      refreshDiscovery.mock.invocationCallOrder[0],
    );
    expect(refreshDiscovery).toHaveBeenCalledOnce();
  });
});
