import { describe, expect, it } from "vitest";

import {
  buildIntegrationStatus,
  connectedResourceLabel,
} from "../../lib/settings/integrations.js";

describe("Settings integration status", () => {
  const resources = [
    { provider: "github", resourceType: "repository" },
    { provider: "github", resourceType: "repository" },
    { provider: "github", resourceType: "project_board" },
    { provider: "railway", resourceType: "service" },
    { provider: "vercel", resourceType: "deployment" },
    { provider: null, resourceType: "documentation" },
  ];

  it("counts only connected GitHub repository Resources", () => {
    const status = buildIntegrationStatus({
      resources,
      githubConfigured: true,
      railwayConfigured: false,
    });

    expect(status.github).toEqual({ configured: true, connectedCount: 2 });
    expect(status.railway).toEqual({ configured: false, connectedCount: 1 });
    expect(status.vercel).toEqual({ configured: false, connectedCount: 1 });
  });

  it("keeps provider configuration independent from connection counts", () => {
    const status = buildIntegrationStatus({
      resources: [],
      githubConfigured: true,
      railwayConfigured: true,
      vercelConfigured: true,
    });

    expect(status.github).toEqual({ configured: true, connectedCount: 0 });
    expect(status.railway).toEqual({ configured: true, connectedCount: 0 });
    expect(status.vercel).toEqual({ configured: true, connectedCount: 0 });
  });

  it("does not report zero connections when the database is unavailable", () => {
    const status = buildIntegrationStatus({
      resources,
      githubConfigured: true,
      connectionsAvailable: false,
    });

    expect(status.github.connectedCount).toBeNull();
    expect(status.railway.connectedCount).toBeNull();
    expect(status.vercel.connectedCount).toBeNull();
    expect(connectedResourceLabel(null, "repository")).toBe(
      "Connection count unavailable",
    );
  });

  it("formats singular and plural connection labels", () => {
    expect(connectedResourceLabel(1, "repository")).toBe(
      "1 connected repository",
    );
    expect(connectedResourceLabel(2, "repository")).toBe(
      "2 connected repositories",
    );
  });
});
