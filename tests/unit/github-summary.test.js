import { describe, expect, it } from "vitest";

import { summarizeProjectGitHub } from "../../lib/projects/github-summary.js";

function project(overrides = {}) {
  return {
    id: "project-id",
    slug: "limitpact",
    name: "LimitPact",
    accent: "258",
    ...overrides,
  };
}

function issue(id) {
  return {
    id: String(id),
    number: id,
    title: `Issue ${id}`,
    updatedAt: `2026-08-${20 + id}T10:00:00Z`,
  };
}

function release(tagName, publishedAt = "2026-08-24T10:00:00Z") {
  return { id: tagName, tagName, publishedAt };
}

function observation(overrides = {}) {
  return {
    projectId: "project-id",
    resourceId: "resource-id",
    componentId: "component-id",
    componentName: "Desktop",
    scopeLabel: "Desktop",
    checkedAt: "2026-08-26T10:00:00Z",
    issues: { status: "success", items: [] },
    release: { status: "success", item: null },
    ...overrides,
  };
}

describe("Project GitHub aggregation", () => {
  it("sums Issues across multiple repositories", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({ issues: { status: "success", items: [issue(1), issue(2)] } }),
      observation({
        resourceId: "website",
        componentId: "website-component",
        componentName: "Website",
        scopeLabel: "Website",
        issues: { status: "success", items: [issue(3)] },
      }),
    ]);

    expect(summary.issues).toMatchObject({
      status: "complete",
      count: 3,
      label: "3 open issues",
      checkedRepositoryCount: 2,
      failedRepositoryCount: 0,
    });
  });

  it("uses a lower-bound Issue count after partial repository failure", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({ issues: { status: "success", items: [issue(1), issue(2)] } }),
      observation({
        resourceId: "website",
        issues: {
          status: "unavailable",
          error: { code: "permission", message: "Issues not allowed" },
        },
      }),
    ]);

    expect(summary.issues).toMatchObject({
      status: "partial",
      count: 2,
      label: "2+ open issues",
      checkedRepositoryCount: 1,
      failedRepositoryCount: 1,
    });
  });

  it("uses an unscoped compact Release only for one repository", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({ release: { status: "success", item: release("v0.2.0") } }),
    ]);

    expect(summary.releases.compactLabel).toBe("v0.2.0");
  });

  it("keeps a lone multi-repository Release explicitly scoped", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({ release: { status: "success", item: release("v0.2.0") } }),
      observation({
        resourceId: "website",
        componentName: "Website",
        scopeLabel: "Website",
      }),
    ]);

    expect(summary.releases.compactLabel).toBe("Desktop v0.2.0");
  });

  it("does not manufacture a Project version from different repository Releases", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({ release: { status: "success", item: release("v0.2.0") } }),
      observation({
        resourceId: "website",
        componentName: "Website",
        scopeLabel: "Website",
        release: { status: "success", item: release("v1.4.0") },
      }),
    ]);

    expect(summary.releases.items.map((item) => item.tagName)).toEqual([
      "v0.2.0",
      "v1.4.0",
    ]);
    expect(summary.releases.compactLabel).toBeNull();
  });
});
