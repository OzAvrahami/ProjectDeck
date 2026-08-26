import { describe, expect, it, vi } from "vitest";

import {
  fetchLatestRailwayDeployment,
  normalizeRailwayDeployment,
  parseRailwayResource,
  railwayDeploymentLabel,
  railwayExternalId,
} from "../../lib/railway/index.js";
import { observeProjectRailway } from "../../lib/projects/railway-observations.js";

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

  it("represents a missing token locally instead of throwing", async () => {
    const result = await observeProjectRailway(
      { railwayResources: [railwayResource()] },
      { token: "", fetchImpl: vi.fn() },
    );

    expect(result.status).toBe("unavailable");
    expect(result.items[0]).toMatchObject({
      status: "unavailable",
      error: { code: "missing_token" },
    });
  });
});
