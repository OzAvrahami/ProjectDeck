import { describe, expect, it } from "vitest";

import { validateHealthMonitorInput } from "../../lib/projects/health-monitor-config.js";

const project = {
  components: [{ id: "website", name: "Website" }],
  railwayResources: [
    {
      id: "railway-resource",
      provider: "railway",
      componentId: "website",
    },
  ],
};

describe("Health monitor configuration", () => {
  it("stores only a PostgreSQL environment-variable name", () => {
    const result = validateHealthMonitorInput(
      {
        monitorType: "postgres",
        label: "Database",
        connectionEnvVar: "LIFEOS_HEALTH_DATABASE_URL",
        affectsProjectHealth: "true",
      },
      project,
    );

    expect(result.valid).toBe(true);
    expect(result.value.configuration).toEqual({
      connectionEnvVar: "LIFEOS_HEALTH_DATABASE_URL",
    });
    expect(JSON.stringify(result.value)).not.toContain("postgresql://");
  });

  it("requires an explicit safe HTTP endpoint", () => {
    expect(
      validateHealthMonitorInput(
        { monitorType: "http", label: "Web", httpUrl: "javascript:alert(1)" },
        project,
      ).valid,
    ).toBe(false);
  });

  it("does not accept new legacy Vercel deployment monitors", () => {
    const result = validateHealthMonitorInput(
      {
        monitorType: "vercel_deployment",
        label: "Legacy deployment",
        vercelProjectId: "prj_legacy",
        vercelTeamId: "team_legacy",
      },
      project,
    );

    expect(result.valid).toBe(false);
    expect(result.errors.monitorType).toBeDefined();
  });

  it("can monitor an existing Railway association without recreating it", () => {
    const result = validateHealthMonitorInput(
      {
        monitorType: "railway_deployment",
        label: "Website",
        existingResourceId: "railway-resource",
        affectsProjectHealth: "false",
      },
      project,
    );

    expect(result.valid).toBe(true);
    expect(result.value.resource.id).toBe("railway-resource");
    expect(result.value.affectsProjectHealth).toBe(false);
  });

  it("rejects a Component outside the Project", () => {
    const result = validateHealthMonitorInput(
      {
        monitorType: "postgres",
        label: "Database",
        componentId: "other-project-component",
        connectionEnvVar: "APP_HEALTH_DATABASE_URL",
      },
      project,
    );

    expect(result.valid).toBe(false);
    expect(result.errors.componentId).toBeDefined();
  });
});
