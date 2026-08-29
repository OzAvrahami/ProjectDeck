import { describe, expect, it, vi } from "vitest";

import {
  associateDiscoveredRailwayResource,
  removeRailwayResourceAssociation,
} from "../../lib/railway/connection.js";
import {
  buildRailwayMappingsView,
  defaultRailwayHealthImpact,
} from "../../lib/railway/mappings.js";
import { RAILWAY_MAPPINGS_PATH } from "../../lib/railway/routes.js";

vi.mock("server-only", () => ({}));

const productionResource = {
  externalId: "workspace:railway-project:production:web",
  workspaceId: "workspace",
  workspaceName: "Oz",
  projectId: "railway-project",
  projectName: "ProjectDeck",
  environmentId: "production",
  environmentName: "production",
  serviceId: "web",
  serviceName: "ProjectDeck",
  sourceRepository: "ozavrahami/projectdeck",
  isDeterministicProduction: true,
};

function connection() {
  return {
    id: "connection",
    connectionState: "connected",
    displayMetadata: {
      workspaces: [{
        id: "workspace",
        name: "Oz",
        projects: [{
          id: "railway-project",
          name: "ProjectDeck",
          environments: [
            { id: "production", name: "production" },
            { id: "staging", name: "staging" },
          ],
          services: [{
            id: "web",
            name: "ProjectDeck",
            sourceRepository: "ozavrahami/projectdeck",
          }],
        }],
      }],
    },
  };
}

function project() {
  return {
    id: "projectdeck",
    slug: "projectdeck",
    name: "ProjectDeck",
    components: [{ id: "component", name: "Web", projectId: "projectdeck" }],
    githubRepositories: [{
      provider: "github",
      resourceType: "repository",
      url: "https://github.com/OzAvrahami/ProjectDeck",
    }],
    providerAssociations: [],
  };
}

function association(overrides = {}) {
  return {
    id: "association",
    providerConnectionId: "connection",
    projectId: "projectdeck",
    componentId: null,
    providerResourceType: "service_environment",
    externalId: productionResource.externalId,
    displayName: "ProjectDeck · production · ProjectDeck",
    associationSource: "automatic",
    enabled: true,
    affectsProjectHealth: true,
    metadata: productionResource,
    ...overrides,
  };
}

function build(associations = [], observations = []) {
  return buildRailwayMappingsView({
    integration: { connection: connection(), associations },
    projects: [project()],
    observations,
  });
}

describe("central Railway mappings", () => {
  it("uses a dedicated route rather than the generic Projects page", () => {
    expect(RAILWAY_MAPPINGS_PATH).toBe(
      "/settings/integrations/railway/mappings",
    );
    expect(RAILWAY_MAPPINGS_PATH).not.toBe("/projects");
  });

  it("lists every discovered service/environment resource", () => {
    const view = build();
    expect(view.resources).toHaveLength(2);
    expect(view.resources.map(({ environmentName }) => environmentName)).toEqual([
      "production",
      "staging",
    ]);
  });

  it("composes unmapped, automatic, and manually overridden states", () => {
    expect(build().resources[0].mappingState).toBe("unmapped");
    expect(build([association()]).resources[0].mappingState).toBe("automatic");
    expect(
      build([association({ associationSource: "manual" })]).resources[0]
        .mappingState,
    ).toBe("manual");
  });

  it("retains optional Component and Health-impact mapping values", () => {
    const row = build([
      association({ componentId: "component", affectsProjectHealth: false }),
    ]).resources[0];
    expect(row.mappedComponent).toEqual({ id: "component", name: "Web" });
    expect(row.association.affectsProjectHealth).toBe(false);
  });

  it("reflects mapping edits and removal from the shared association data", () => {
    const edited = build([
      association({ componentId: "component", associationSource: "manual" }),
    ]);
    expect(edited.resources[0].mappedComponent.name).toBe("Web");
    expect(build().resources[0].association).toBeNull();
  });

  it("defaults production to health-affecting and staging to informational", () => {
    const rows = build().resources;
    expect(defaultRailwayHealthImpact(rows[0])).toBe(true);
    expect(defaultRailwayHealthImpact(rows[1])).toBe(false);
  });

  it("includes latest deployment evidence already observed for a mapping", () => {
    const row = build([association()], [{
      projectId: "projectdeck",
      observation: {
        monitor: { id: "association" },
        status: "degraded",
        reason: "Latest production deployment failed.",
        observedAt: "2026-08-29T10:00:00.000Z",
        evidence: { latestDeploymentStatus: "failed" },
      },
    }]).resources[0];
    expect(row.deployment).toMatchObject({
      status: "degraded",
      providerStatus: "failed",
    });
  });

  it("updates mapped and unmapped Settings counts from current associations", () => {
    expect(build().counts).toMatchObject({ mapped: 0, unmapped: 2 });
    expect(build([association()]).counts).toMatchObject({ mapped: 1, unmapped: 1 });
  });
});

describe("Railway mapping mutations", () => {
  it("upserts one local association without calling Railway", async () => {
    const upsertAssociation = vi.fn().mockImplementation(async (input) => input);
    await associateDiscoveredRailwayResource(
      {
        project: project(),
        componentId: "component",
        externalId: productionResource.externalId,
        affectsProjectHealth: false,
      },
      {
        getConnection: vi.fn().mockResolvedValue(connection()),
        upsertAssociation,
      },
    );
    expect(upsertAssociation).toHaveBeenCalledOnce();
    expect(upsertAssociation).toHaveBeenCalledWith(
      expect.objectContaining({
        associationSource: "manual",
        componentId: "component",
        affectsProjectHealth: false,
      }),
    );
  });

  it("removes only the local association for the active connection", async () => {
    const deleteAssociation = vi.fn().mockResolvedValue(association());
    await removeRailwayResourceAssociation("association", {
      getConnection: vi.fn().mockResolvedValue(connection()),
      listAssociations: vi.fn().mockResolvedValue([association()]),
      deleteAssociation,
    });
    expect(deleteAssociation).toHaveBeenCalledWith("association", "connection");
  });
});
