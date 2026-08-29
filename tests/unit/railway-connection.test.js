import { describe, expect, it, vi } from "vitest";

import {
  findAutomaticRailwayAssociations,
} from "../../lib/railway/associations.js";
import {
  flattenRailwayServices,
  selectProductionEnvironment,
} from "../../lib/railway/discovery.js";
import {
  observeRailwayConnectionHealth,
  railwayServiceDeploymentHealth,
} from "../../lib/health/providers/railway-connection.js";

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
    expect(railwayServiceDeploymentHealth([{ id: "latest", status: "success" }]).status).toBe("healthy");
    const failed = railwayServiceDeploymentHealth(
      [{ id: "failed", status: "failed" }],
      { id: "active", status: "success" },
    );
    expect(failed.status).toBe("degraded");
    expect(failed.evidence.attentionSignal).toBe("latest_deployment_failed");
    expect(railwayServiceDeploymentHealth([{ id: "crash", status: "crashed" }]).status).toBe("down");
    expect(railwayServiceDeploymentHealth([{ id: "build", status: "building" }]).status).toBe("degraded");
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
});
