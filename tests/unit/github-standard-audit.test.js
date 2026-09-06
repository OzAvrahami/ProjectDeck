import { describe, expect, it, vi } from "vitest";

import { auditGitHubDevelopmentStandard } from "../../lib/github/standard/audit.js";
import { observeGitHubDevelopmentStandard } from "../../lib/github/standard/observe.js";
import {
  STANDARD_PROJECT_PRIORITIES,
  STANDARD_PROJECT_STATUSES,
  STANDARD_REPOSITORY_LABELS,
} from "../../lib/github/standard/definition.js";

vi.mock("server-only", () => ({}));

const PROJECT = { id: "projectdeck", slug: "projectdeck", name: "ProjectDeck" };
const GITHUB_PROJECT = {
  id: "PV2_standard",
  number: 9,
  title: "ProjectDeck Development",
  url: "https://github.com/users/OzAvrahami/projects/9",
};

function standardReadModel(overrides = {}) {
  return {
    ...GITHUB_PROJECT,
    partial: false,
    totalItemCount: 0,
    fields: [
      { id: "status", name: "Status", type: "ProjectV2SingleSelectField" },
      { id: "priority", name: "Priority", type: "ProjectV2SingleSelectField" },
    ],
    statusField: {
      available: true,
      standard: true,
      id: "status",
      options: STANDARD_PROJECT_STATUSES,
    },
    priorityField: {
      available: true,
      standard: true,
      id: "priority",
      options: STANDARD_PROJECT_PRIORITIES,
    },
    viewsPartial: false,
    views: [
      {
        id: "development",
        name: "Development",
        layout: "BOARD_LAYOUT",
        groupByFields: [],
        verticalGroupByFields: [{ id: "status", name: "Status" }],
      },
      { id: "all", name: "All work", layout: "TABLE_LAYOUT", groupByFields: [] },
    ],
    workflows: [{ id: "workflow", name: "Item closed", enabled: true }],
    items: [],
    ...overrides,
  };
}

function resolved(readModel = standardReadModel(), overrides = {}) {
  return {
    status: "resolved",
    reason: "exact_repository_set",
    repositoryVisibility: "complete",
    project: GITHUB_PROJECT,
    readModel,
    ...overrides,
  };
}

function repository(fullName = "OzAvrahami/ProjectDeck", overrides = {}) {
  const [owner, name] = fullName.split("/");
  return {
    resourceId: `resource-${name}`,
    repository: { owner, name, fullName },
    component: null,
    status: "available",
    labels: STANDARD_REPOSITORY_LABELS.map((label, index) => ({
      id: String(index + 1),
      name: label,
    })),
    releaseStatus: "available",
    latestRelease: null,
    ...overrides,
  };
}

function audit(overrides = {}) {
  return auditGitHubDevelopmentStandard({
    project: PROJECT,
    workflowEvidence: resolved(),
    repositories: [repository()],
    observedAt: "2026-09-05T10:00:00.000Z",
    ...overrides,
  });
}

function find(result, id) {
  return result.findings.find((item) => item.id === id);
}

describe("GitHub Development Standard audit", () => {
  it("runs the provider audit without a Standard write credential", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(
      STANDARD_REPOSITORY_LABELS.map((name, index) => ({
        id: index + 1,
        name,
        color: "ededed",
      })),
    ), { status: 200 }));
    const result = await observeGitHubDevelopmentStandard({
      ...PROJECT,
      githubRepositories: [{
        id: "resource-ProjectDeck",
        provider: "github",
        resourceType: "repository",
        url: "https://github.com/OzAvrahami/ProjectDeck",
      }],
      githubWorkflowEvidence: resolved(),
      githubSummary: {
        releases: {
          repositories: [{
            resourceId: "resource-ProjectDeck",
            repository: { fullName: "OzAvrahami/ProjectDeck" },
            providerStatus: "success",
            latestRelease: null,
          }],
        },
      },
    }, {
      token: "read-token",
      fetchImpl,
      environment: { GITHUB_TOKEN: "read-token" },
      now: new Date("2026-09-05T10:00:00.000Z"),
    });

    expect(result.status).toBe("conformant");
    expect(result.writeCapabilities).toMatchObject({
      projects: { available: false },
      repository: { available: false },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("recognizes a fully conformant observable Project", () => {
    const result = audit();

    expect(result.status).toBe("conformant");
    expect(result.summary.safe_change).toBe(0);
    expect(result.preservation).toEqual({
      issueStatus: "preserved",
      issuePriority: "preserved",
      unknownLabels: "preserved",
      scopeLabels: "repository_specific",
    });
  });

  it("uses the board column field reported by GitHub as vertical grouping", () => {
    const result = audit({
      workflowEvidence: resolved(standardReadModel({
        views: [
          {
            id: "development",
            name: "Development",
            layout: "BOARD_LAYOUT",
            groupByFields: [],
            verticalGroupByFields: [{ id: "status", name: "Status" }],
          },
          {
            id: "all",
            name: "All work",
            layout: "TABLE_LAYOUT",
            groupByFields: [],
            verticalGroupByFields: [],
          },
        ],
      })),
    });

    expect(find(result, "project:view:development")).toMatchObject({
      classification: "conformant",
    });
  });

  it("makes a missing Status field an additive safe change", () => {
    const readModel = standardReadModel({
      fields: [{ id: "priority", name: "Priority", type: "ProjectV2SingleSelectField" }],
      statusField: { available: false, standard: false, id: null, options: [] },
    });
    const result = audit({ workflowEvidence: resolved(readModel) });

    expect(find(result, "project:field:status")).toMatchObject({
      classification: "safe_change",
      action: "create_project_single_select_field",
      safeToAutomate: true,
      current: "Missing",
    });
  });

  it("requires manual review for non-standard Status options and preserves used values", () => {
    const readModel = standardReadModel({
      statusField: {
        available: true,
        standard: false,
        id: "status",
        options: ["Todo", "Doing", "Done"],
      },
      items: [{ status: "Doing", priority: "P1 — High", labels: [] }],
    });
    const result = audit({ workflowEvidence: resolved(readModel) });

    expect(find(result, "project:field:status")).toMatchObject({
      classification: "manual_required",
      safeToAutomate: false,
      evidence: { usedValues: ["Doing"] },
    });
  });

  it("makes missing Priority safe but non-standard Priority manual", () => {
    const missing = standardReadModel({
      fields: [{ id: "status", name: "Status", type: "ProjectV2SingleSelectField" }],
      priorityField: { available: false, standard: false, id: null, options: [] },
    });
    expect(find(audit({ workflowEvidence: resolved(missing) }), "project:field:priority"))
      .toMatchObject({ classification: "safe_change" });

    const drifted = standardReadModel({
      priorityField: {
        available: true,
        standard: false,
        id: "priority",
        options: ["Urgent", "Normal"],
      },
      items: [{ status: "Ready", priority: "Urgent", labels: [] }],
    });
    expect(find(audit({ workflowEvidence: resolved(drifted) }), "project:field:priority"))
      .toMatchObject({
        classification: "manual_required",
        evidence: { usedValues: ["Urgent"] },
      });
  });

  it("plans each missing canonical label without removing unknown labels", () => {
    const result = audit({
      repositories: [repository("OzAvrahami/ProjectDeck", {
        labels: [{ id: "custom", name: "scope: backend" }],
      })],
    });

    expect(result.findings.filter((item) => item.action === "create_repository_label"))
      .toHaveLength(STANDARD_REPOSITORY_LABELS.length);
    expect(result.findings.some((item) => item.action?.includes("delete"))).toBe(false);
  });

  it("keeps multi-repository label and release evidence repository scoped", () => {
    const result = audit({
      repositories: [
        repository("OzAvrahami/desktop", { component: { id: "desktop", name: "Desktop" } }),
        repository("OzAvrahami/website", {
          component: { id: "website", name: "Website" },
          labels: [],
          latestRelease: { tagName: "release-2026-09" },
        }),
      ],
    });

    const websiteRelease = find(result, "repository:OzAvrahami/website:release");
    expect(websiteRelease).toMatchObject({
      classification: "manual_required",
      target: {
        repository: { fullName: "OzAvrahami/website" },
        component: { name: "Website" },
      },
    });
    expect(result.findings.filter((item) => item.action === "create_repository_label"))
      .toHaveLength(STANDARD_REPOSITORY_LABELS.length);
  });

  it("marks partial visibility as unknown and prevents a complete audit", () => {
    const readModel = standardReadModel({ partial: true, totalItemCount: 120, items: [] });
    const result = audit({
      workflowEvidence: resolved(readModel, { repositoryVisibility: "partial" }),
    });

    expect(result.status).toBe("incomplete");
    expect(find(result, "project:items:visibility").classification).toBe("unknown");
    expect(find(result, "project:resolution").classification).toBe("unknown");
  });

  it("does not create a field when the Project field collection is partial", () => {
    const readModel = standardReadModel({
      fieldsPartial: true,
      fields: [],
      statusField: { available: false, standard: false, id: null, options: [] },
    });
    const result = audit({ workflowEvidence: resolved(readModel) });

    expect(find(result, "project:field:status")).toMatchObject({
      classification: "unknown",
      safeToAutomate: false,
      action: null,
    });
  });

  it("does not create a duplicate when an incompatible same-name field exists", () => {
    const readModel = standardReadModel({
      fields: [{ id: "text-status", name: "Status", type: "ProjectV2Field" }],
      statusField: { available: false, standard: false, id: null, options: [] },
    });
    const result = audit({ workflowEvidence: resolved(readModel) });

    expect(find(result, "project:field:status")).toMatchObject({
      classification: "manual_required",
      safeToAutomate: false,
      action: null,
    });
  });

  it("blocks Project-level planning when resolution is ambiguous", () => {
    const result = audit({
      workflowEvidence: {
        status: "ambiguous",
        reason: "multiple_repository_matches",
        candidates: [GITHUB_PROJECT, { ...GITHUB_PROJECT, id: "other", title: "Other" }],
      },
    });

    expect(result.status).toBe("incomplete");
    expect(find(result, "project:resolution")).toMatchObject({ classification: "blocked" });
    expect(find(result, "project:configuration")).toMatchObject({ classification: "blocked" });
  });

  it("flags multiple canonical primary labels without changing Status or Priority", () => {
    const readModel = standardReadModel({
      items: [{
        repository: "OzAvrahami/ProjectDeck",
        number: 9,
        title: "Standardize workflows",
        url: "https://github.com/OzAvrahami/ProjectDeck/issues/9",
        status: "In Progress",
        priority: "P1 — High",
        labels: ["feature", "bug", "scope: github"],
      }],
    });
    const result = audit({ workflowEvidence: resolved(readModel) });
    const conflict = find(result, "issue:OzAvrahami/ProjectDeck#9:primary-type");

    expect(conflict).toMatchObject({
      classification: "manual_required",
      current: ["feature", "bug"],
      evidence: { status: "In Progress", priority: "P1 — High" },
    });
    expect(conflict.action).toBeNull();
  });
});
