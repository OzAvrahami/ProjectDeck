import { describe, expect, it, vi } from "vitest";

import { buildGitHubStandardMigrationPlan } from "../../lib/github/standard/plan.js";

vi.mock("server-only", () => ({}));

function makeAudit(findings) {
  return {
    standard: "Oz GitHub Development Standard v1",
    version: "v1",
    status: "differences",
    project: { id: "project", slug: "project", name: "Project" },
    githubProject: { id: "PV2", title: "Project Development" },
    repositories: [{
      resourceId: "repo",
      status: "available",
      repository: { owner: "OzAvrahami", name: "Project", fullName: "OzAvrahami/Project" },
      labels: [{ id: "custom", name: "scope: backend" }],
      latestRelease: null,
    }],
    findings,
  };
}

function safeLabelFinding() {
  return {
    id: "repository:OzAvrahami/Project:label:bug",
    area: "primary_type_label",
    classification: "safe_change",
    target: {
      kind: "github_repository",
      repository: { owner: "OzAvrahami", name: "Project", fullName: "OzAvrahami/Project" },
      label: "bug",
    },
    current: "Missing",
    desired: "bug",
    action: "create_repository_label",
    safeToAutomate: true,
    reason: "Additive label creation.",
  };
}

describe("GitHub Standard migration plan", () => {
  it("allows a narrowly additive canonical-label change", () => {
    const plan = buildGitHubStandardMigrationPlan(makeAudit([safeLabelFinding()]));

    expect(plan.safeSteps).toHaveLength(1);
    expect(plan.safeSteps[0]).toMatchObject({ action: "create_repository_label" });
  });

  it("makes ambiguous field migration manual and preserves Issue values", () => {
    const plan = buildGitHubStandardMigrationPlan(makeAudit([{
      id: "project:field:status",
      area: "project_field",
      classification: "manual_required",
      target: { kind: "github_project_field", project: { id: "PV2" }, fieldName: "Status" },
      current: ["Todo", "Doing", "Done"],
      desired: ["Backlog", "Ready", "In Progress", "Verify", "Done"],
      action: null,
      safeToAutomate: false,
      reason: "No guessed mapping.",
      evidence: { usedValues: ["Doing"] },
    }]));

    expect(plan.safeSteps).toHaveLength(0);
    expect(plan.manualSteps).toHaveLength(1);
    expect(plan.manualSteps[0].evidence.usedValues).toEqual(["Doing"]);
    expect(plan.invariants).toMatchObject({
      destructiveCleanup: false,
      issueStatusMutation: false,
      issuePriorityMutation: false,
      inferredMappings: false,
    });
  });

  it("never automates unknown labels, cleanup, or inferred mappings", () => {
    const unsafe = {
      ...safeLabelFinding(),
      id: "delete-custom-label",
      action: "delete_repository_label",
      target: { ...safeLabelFinding().target, label: "scope: backend" },
      current: "scope: backend",
      desired: "Removed",
    };
    const plan = buildGitHubStandardMigrationPlan(makeAudit([unsafe]));

    expect(plan.safeSteps).toHaveLength(0);
    expect(plan.manualSteps).toHaveLength(1);
    expect(plan.invariants.labelRemoval).toBe(false);
  });

  it("produces a deterministic fingerprint from provider evidence", () => {
    const first = buildGitHubStandardMigrationPlan(makeAudit([safeLabelFinding()]));
    const second = buildGitHubStandardMigrationPlan(makeAudit([safeLabelFinding()]));

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
