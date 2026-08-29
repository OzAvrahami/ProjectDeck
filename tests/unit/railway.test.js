import { describe, expect, it, vi } from "vitest";

import {
  fetchLatestRailwayDeployment,
  fetchRailwayDeploymentState,
  normalizeRailwayDeployment,
  parseRailwayResource,
  RailwayProviderError,
  railwayGraphQL,
  railwayDeploymentLabel,
  railwayExternalId,
} from "../../lib/railway/index.js";

vi.mock("server-only", () => ({}));

const identity = {
  projectId: "railway-project",
  environmentId: "production",
  serviceId: "web",
};

function railwayResource() {
  return {
    id: "resource",
    provider: "railway",
    resourceType: "service",
    label: "Production",
    url: "https://railway.com/project/railway-project/service/web",
    externalId: railwayExternalId(identity),
    componentName: null,
  };
}

describe("Railway observations", () => {
  it("round-trips the explicit service association", () => {
    expect(parseRailwayResource(railwayResource())).toEqual(identity);
  });

  it("normalizes provider-native deployment state", () => {
    expect(
      normalizeRailwayDeployment({
        id: "deployment",
        ...identity,
        status: "SUCCESS",
        createdAt: "2026-08-25T09:00:00Z",
        statusUpdatedAt: "2026-08-25T10:00:00Z",
      }),
    ).toMatchObject({
      id: "deployment",
      status: "success",
      observedStateAt: "2026-08-25T10:00:00Z",
    });
    expect(railwayDeploymentLabel("success")).toBe(
      "Latest deployment succeeded",
    );
  });

  it("fetches the latest deployment with explicit IDs", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            deployments: {
              edges: [
                {
                  node: {
                    id: "deployment",
                    ...identity,
                    status: "FAILED",
                  },
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      fetchLatestRailwayDeployment(identity, { token: "token", fetchImpl }),
    ).resolves.toMatchObject({ status: "failed" });
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(request.variables.input).toEqual(identity);
  });

  it("reads recent and active deployments with separate current-schema queries", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (_url, options) => {
      const request = JSON.parse(options.body);
      return new Response(JSON.stringify({
        data: {
          deployments: request.operationName === "RecentDeployments"
            ? { edges: [{ node: { id: "failed", ...identity, status: "FAILED" } }] }
            : undefined,
          serviceInstance: request.operationName === "ActiveDeployments"
            ? { activeDeployments: [{ id: "active", ...identity, status: "SUCCESS" }] }
            : undefined,
        },
      }), { status: 200 });
    });
    const state = await fetchRailwayDeploymentState(identity, {
      token: "token",
      fetchImpl,
    });
    expect(state.deployments[0].status).toBe("failed");
    expect(state.activeDeployment.status).toBe("success");
    const requests = fetchImpl.mock.calls.map(([, options]) =>
      JSON.parse(options.body),
    );
    expect(requests.map(({ operationName }) => operationName).sort()).toEqual([
      "ActiveDeployments",
      "RecentDeployments",
    ]);
    const active = requests.find(
      ({ operationName }) => operationName === "ActiveDeployments",
    );
    expect(active.variables).toEqual({
      environmentId: identity.environmentId,
      serviceId: identity.serviceId,
    });
    expect(JSON.stringify(active)).not.toContain("successfulOnly");
  });

  it("retains HTTP and GraphQL diagnostics without exposing authorization", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        errors: [{
          message: "Unknown field successfulOnly",
          path: ["deployments"],
          extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
        }],
      }), { status: 400 }),
    );

    const error = await railwayGraphQL(
      "query DeploymentProbe { deployments(first: 1, input: {}) { edges { node { id } } } }",
      {},
      { token: "secret-token", fetchImpl },
    ).catch((reason) => reason);

    expect(error).toBeInstanceOf(RailwayProviderError);
    expect(error).toMatchObject({
      code: "graphql",
      status: 400,
      operationName: "DeploymentProbe",
    });
    expect(error.graphqlErrors[0]).toEqual({
      message: "Unknown field successfulOnly",
      code: "GRAPHQL_VALIDATION_FAILED",
      path: ["deployments"],
    });
    expect(JSON.stringify(error)).not.toContain("secret-token");
  });

  it("rejects deployment data returned for a different service identity", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (_url, options) => {
      const request = JSON.parse(options.body);
      return new Response(JSON.stringify({
        data: {
          deployments: request.operationName === "RecentDeployments"
            ? { edges: [{ node: { id: "wrong", ...identity, serviceId: "other", status: "SUCCESS" } }] }
            : { edges: [] },
        },
      }), { status: 200 });
    });

    await expect(
      fetchRailwayDeploymentState(identity, { token: "token", fetchImpl }),
    ).rejects.toMatchObject({ code: "invalid_association" });
  });

  it("returns a scoped partial result when only active-deployment lookup fails", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.operationName === "ActiveDeployments") {
        return new Response(JSON.stringify({
          errors: [{ message: "temporary failure", extensions: { code: "INTERNAL" } }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        data: { deployments: { edges: [{ node: { id: "latest", ...identity, status: "SUCCESS" } }] } },
      }), { status: 200 });
    });

    const state = await fetchRailwayDeploymentState(identity, {
      token: "token",
      fetchImpl,
    });
    expect(state.deployments[0].status).toBe("success");
    expect(state.activeDeployment).toBeNull();
    expect(state.partialError).toMatchObject({
      code: "graphql",
      operationName: "ActiveDeployments",
    });
  });

  it("treats a missing service instance with no deployments as no deployment state", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.operationName === "ActiveDeployments") {
        return new Response(JSON.stringify({
          data: null,
          errors: [{
            message: "ServiceInstance not found",
            extensions: { code: "INTERNAL_SERVER_ERROR" },
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        data: { deployments: { edges: [] } },
      }), { status: 200 });
    });

    await expect(fetchRailwayDeploymentState(identity, {
      token: "token",
      fetchImpl,
    })).resolves.toEqual({
      deployments: [],
      activeDeployment: null,
      partialError: null,
    });
  });
});
