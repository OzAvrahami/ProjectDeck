import { describe, expect, it } from "vitest";

import { synthesizeProjectAttention } from "../../lib/projects/attention.js";

function project(overrides = {}) {
  return {
    id: "project",
    needsAttention: false,
    attentionSummary: null,
    phase: { phase: "development" },
    next: { source: "none" },
    githubRepositories: [{
      id: "repository-resource",
      provider: "github",
      resourceType: "repository",
      externalId: "123",
      url: "https://github.com/example/project",
      componentId: null,
      componentName: null,
    }],
    ...overrides,
  };
}

function observation(overrides = {}) {
  return {
    status: "healthy",
    provider: "http",
    reason: "HTTP 200",
    observedAt: "2026-09-02T10:00:00.000Z",
    monitor: {
      id: "monitor",
      label: "Production",
      monitorType: "http",
      enabled: true,
      affectsProjectHealth: true,
    },
    resource: null,
    component: null,
    evidence: null,
    error: null,
    ...overrides,
  };
}

function health(status = "healthy", observations = []) {
  return { status, observations, reason: `${status} health` };
}

function issue(overrides = {}) {
  return {
    type: "issue",
    id: "issue",
    repositoryId: "R_project",
    repositoryDatabaseId: "123",
    repository: "example/project",
    number: 42,
    title: "Fix production failure",
    state: "open",
    labels: ["bug"],
    status: "Ready",
    priority: "P0 — Critical",
    updatedAt: "2026-09-02T11:00:00.000Z",
    url: "https://github.com/example/project/issues/42",
    ...overrides,
  };
}

function workflow(items = []) {
  return {
    status: "resolved",
    readModel: {
      statusField: { standard: true },
      priorityField: { standard: true },
      items,
    },
  };
}

function synthesize({
  project: projectValue = project(),
  health: healthValue = health(),
  workflowEvidence = workflow(),
} = {}) {
  return synthesizeProjectAttention({
    project: projectValue,
    health: healthValue,
    workflowEvidence,
  });
}

describe("automatic Project attention", () => {
  it("lets manual forced attention win and represents it distinctly", () => {
    const result = synthesize({
      project: project({
        needsAttention: true,
        attentionSummary: "Prepare production migration",
      }),
      health: health("down"),
    });

    expect(result).toMatchObject({
      needs_attention: true,
      source: "manual",
      severity: "critical",
      primary_reason: "Prepare production migration",
    });
    expect(result.reasons[0]).toMatchObject({
      code: "manual_override",
      severity: "normal",
    });
  });

  it("maps aggregate Health Down to critical attention", () => {
    expect(synthesize({ health: health("down") })).toMatchObject({
      needs_attention: true,
      source: "automatic",
      severity: "critical",
    });
  });

  it.each([
    ["PostgreSQL", "postgresql", "ProjectDeck Database"],
    ["HTTP", "http", "ProjectDeck HTTP"],
  ])("maps required %s Down to critical attention", (_name, provider, label) => {
    const result = synthesize({
      health: health("down", [observation({
        status: "down",
        provider,
        monitor: {
          id: provider,
          label,
          monitorType: provider === "postgresql" ? "postgres" : "http",
          enabled: true,
          affectsProjectHealth: true,
        },
      })]),
    });

    expect(result).toMatchObject({
      needs_attention: true,
      severity: "critical",
      primary_reason: `${label} is down`,
    });
  });

  it("maps a crashed current Railway production deployment to critical attention", () => {
    const result = synthesize({
      health: health("down", [observation({
        status: "down",
        provider: "railway",
        reason: "Current production deployment crashed.",
        monitor: {
          id: "railway",
          label: "ProjectDeck · production · API",
          monitorType: "railway_connection",
          enabled: true,
          affectsProjectHealth: true,
        },
        resource: { id: "service", label: "API", externalId: "service" },
      })]),
    });

    expect(result).toMatchObject({ needs_attention: true, severity: "critical" });
    expect(result.reasons[0]).toMatchObject({ provider: "railway" });
  });

  it("maps a failed latest Railway deployment with older production serving to high attention", () => {
    const result = synthesize({
      health: health("degraded", [observation({
        status: "degraded",
        provider: "railway",
        reason: "Latest failed; an earlier deployment remains available.",
        evidence: {
          latestDeploymentFailed: true,
          attentionSignal: "latest_deployment_failed",
          activeDeploymentId: "older-production",
        },
      })]),
    });

    expect(result).toMatchObject({
      needs_attention: true,
      severity: "high",
      primary_reason: "Latest Railway production deployment failed",
    });
    expect(result.reasons[0].evidence.active_deployment_id).toBe("older-production");
  });

  it.each(["building", "deploying", "queued"])(
    "does not escalate normal Railway %s by itself",
    (deploymentState) => {
      const result = synthesize({
        health: health("degraded", [observation({
          status: "degraded",
          provider: "railway",
          evidence: {
            attentionSignal: "deployment_transitional",
            latestDeploymentStatus: deploymentState,
          },
        })]),
      });
      expect(result.needs_attention).toBe(false);
    },
  );

  it("does not escalate an informational monitor that is Down", () => {
    const result = synthesize({
      health: health("healthy", [observation({
        status: "down",
        monitor: {
          id: "informational",
          label: "Staging",
          monitorType: "http",
          enabled: true,
          affectsProjectHealth: false,
        },
      })]),
    });
    expect(result.needs_attention).toBe(false);
  });

  it("does not escalate an informational staging failure", () => {
    const result = synthesize({
      health: health("healthy", [observation({
        status: "degraded",
        provider: "railway",
        monitor: {
          id: "staging",
          label: "Staging",
          monitorType: "railway_connection",
          enabled: true,
          affectsProjectHealth: false,
        },
        evidence: { attentionSignal: "latest_deployment_failed" },
      })]),
    });
    expect(result.needs_attention).toBe(false);
  });

  it.each(["Ready", "In Progress"])(
    "maps an open P0 bug in %s to critical attention",
    (status) => {
      expect(synthesize({ workflowEvidence: workflow([issue({ status })]) })).toMatchObject({
        needs_attention: true,
        severity: "critical",
        primary_reason: `P0 bug #42 is ${status}`,
      });
    },
  );

  it("maps an open P1 bug in Verify to high attention", () => {
    expect(synthesize({
      workflowEvidence: workflow([issue({ status: "Verify", priority: "P1 — High" })]),
    })).toMatchObject({ needs_attention: true, severity: "high" });
  });

  it("does not escalate a P1 Backlog bug", () => {
    expect(synthesize({
      workflowEvidence: workflow([issue({ status: "Backlog", priority: "P1 — High" })]),
    }).needs_attention).toBe(false);
  });

  it.each(["P2 — Medium", "P3 — Low"])(
    "does not escalate a %s bug in v1",
    (priority) => {
      expect(synthesize({ workflowEvidence: workflow([issue({ priority })]) }).needs_attention).toBe(false);
    },
  );

  it("does not escalate a P0 feature", () => {
    expect(synthesize({
      workflowEvidence: workflow([issue({ labels: ["feature"] })]),
    }).needs_attention).toBe(false);
  });

  it("does not escalate a closed bug", () => {
    expect(synthesize({
      workflowEvidence: workflow([issue({ state: "closed" })]),
    }).needs_attention).toBe(false);
  });

  it("does not escalate a Done bug", () => {
    expect(synthesize({
      workflowEvidence: workflow([issue({ status: "Done" })]),
    }).needs_attention).toBe(false);
  });

  it("chooses the highest severity while retaining all reasons", () => {
    const result = synthesize({
      health: health("down", [observation({ status: "down" })]),
      workflowEvidence: workflow([issue({ priority: "P1 — High" })]),
    });
    expect(result.severity).toBe("critical");
    expect(result.reasons.map(({ code }) => code)).toEqual([
      "required_resource_down",
      "high_priority_active_bug",
    ]);
  });

  it("retains reasons without duplicate equivalent evidence", () => {
    const duplicate = observation({
      status: "degraded",
      provider: "railway",
      resource: { id: "service", externalId: "service", label: "API" },
      evidence: { attentionSignal: "latest_deployment_failed" },
    });
    const result = synthesize({ health: health("degraded", [duplicate, duplicate]) });
    expect(result.reasons).toHaveLength(1);
  });

  it("keeps Health attention working when GitHub is unavailable", () => {
    const result = synthesize({
      health: health("down"),
      workflowEvidence: { status: "unavailable", error: { code: "provider_failed" } },
    });
    expect(result).toMatchObject({ needs_attention: true, source: "automatic" });
    expect(result.availability.github_bugs).toBe("unavailable");
  });

  it("keeps P0 bug attention working when Health is unavailable", () => {
    const result = synthesize({
      health: health("unknown"),
      workflowEvidence: workflow([issue()]),
    });
    expect(result).toMatchObject({
      needs_attention: true,
      source: "automatic",
      severity: "critical",
    });
    expect(result.availability.health).toBe("unavailable");
  });

  it("does not escalate Not monitored", () => {
    expect(synthesize({ health: health("not_monitored") })).toMatchObject({
      needs_attention: false,
      source: "none",
    });
  });

  it.each(["planning", "maintenance"])(
    "does not escalate %s Phase alone",
    (phase) => {
      expect(synthesize({ project: project({ phase: { phase } }) }).needs_attention).toBe(false);
    },
  );

  it("does not escalate absence of a clear Next action", () => {
    expect(synthesize({
      project: project({ next: { source: "none", action: null } }),
    }).needs_attention).toBe(false);
  });

  it("preserves provider, resource, and Component context", () => {
    const result = synthesize({
      project: project({
        githubRepositories: [{
          id: "website-repository",
          provider: "github",
          resourceType: "repository",
          externalId: "456",
          url: "https://github.com/example/website",
          componentId: "website",
          componentName: "Website",
        }],
      }),
      health: health("down", [observation({
        status: "down",
        provider: "railway",
        resource: { id: "api", label: "Production API", externalId: "api" },
        component: { id: "website", name: "Website" },
      })]),
      workflowEvidence: workflow(),
    });

    expect(result.reasons[0]).toMatchObject({
      provider: "railway",
      resource: { label: "Production API" },
      component: { id: "website", name: "Website" },
      observed_at: "2026-09-02T10:00:00.000Z",
    });
    expect(result.observed_at).toBe("2026-09-02T10:00:00.000Z");
  });

  it("escalates explicit health-provider configuration failures but not transient timeouts", () => {
    const configuredFailure = observation({
      status: "unknown",
      provider: "railway",
      error: { code: "authentication_failed" },
    });
    expect(synthesize({
      health: health("unknown", [configuredFailure]),
    })).toMatchObject({
      needs_attention: true,
      severity: "high",
      primary_reason: "Railway monitoring requires reconnection",
    });

    const timeout = observation({
      status: "unknown",
      provider: "railway",
      error: { code: "provider_failed" },
    });
    expect(synthesize({ health: health("unknown", [timeout]) }).needs_attention).toBe(false);
  });
});
