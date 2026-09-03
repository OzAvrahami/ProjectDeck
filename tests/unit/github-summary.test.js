import { describe, expect, it } from "vitest";

import {
  filterProjectIssues,
  hasCanonicalBugLabel,
  summarizeProjectGitHub,
} from "../../lib/projects/github-summary.js";

function project(overrides = {}) {
  return {
    id: "project-id",
    slug: "limitpact",
    name: "LimitPact",
    accent: "258",
    ...overrides,
  };
}

function issue(id, overrides = {}) {
  return {
    type: "issue",
    id: String(id),
    number: id,
    title: `Issue ${id}`,
    state: "open",
    labels: [],
    repository: {
      fullName: "example/desktop",
    },
    updatedAt: `2026-08-${20 + id}T10:00:00Z`,
    ...overrides,
  };
}

function release(
  tagName,
  publishedAt = "2026-08-24T10:00:00Z",
  overrides = {},
) {
  return {
    id: tagName,
    tag: tagName,
    tagName,
    name: null,
    repository: { fullName: "example/desktop" },
    url: `https://github.com/example/desktop/releases/tag/${tagName}`,
    publishedAt,
    prerelease: false,
    draft: false,
    ...overrides,
  };
}

function commit(id, committedAt, overrides = {}) {
  return {
    id,
    sha: id,
    shortSha: id.slice(0, 7),
    subject: `docs: commit ${id}`,
    message: `docs: commit ${id}`,
    repository: { name: "desktop", fullName: "example/desktop" },
    repositoryDisplayName: "desktop",
    committedAt,
    url: `https://github.com/example/desktop/commit/${id}`,
    ...overrides,
  };
}

function observation(overrides = {}) {
  return {
    projectId: "project-id",
    resourceId: "resource-id",
    componentId: "component-id",
    componentName: "Desktop",
    repository: { fullName: "example/desktop" },
    scopeLabel: "Desktop",
    checkedAt: "2026-08-26T10:00:00Z",
    issues: { status: "success", items: [] },
    release: { status: "success", item: null },
    activity: { status: "success", items: [] },
    ...overrides,
  };
}

describe("Project GitHub aggregation", () => {
  it("sums Issues across multiple repositories", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({ issues: { status: "success", items: [issue(1, { labels: ["bug"] }), issue(2)] } }),
      observation({
        resourceId: "website",
        componentId: "website-component",
        componentName: "Website",
        scopeLabel: "Website",
        issues: { status: "success", items: [issue(3, {
          labels: [{ name: "BUG" }],
          repository: { fullName: "example/website" },
        })] },
      }),
    ]);

    expect(summary.issues).toMatchObject({
      status: "complete",
      count: 3,
      openIssueCount: 3,
      openBugCount: 2,
      label: "2 bugs · 3 open",
      checkedRepositoryCount: 2,
      failedRepositoryCount: 0,
    });
  });

  it("uses a lower-bound Issue count after partial repository failure", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({ issues: { status: "success", items: [issue(1, { labels: ["bug"] }), issue(2)] } }),
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
      openIssueCount: 2,
      openBugCount: 1,
      label: "1+ bugs · 2+ open",
      checkedRepositoryCount: 1,
      failedRepositoryCount: 1,
    });
  });

  it("uses only the exact canonical bug label", () => {
    expect(hasCanonicalBugLabel(issue(1, { labels: ["bug"] }))).toBe(true);
    expect(hasCanonicalBugLabel(issue(2, { labels: [{ name: " BUG " }] }))).toBe(true);
    expect(hasCanonicalBugLabel(issue(3, { labels: ["bugfix"] }))).toBe(false);
    expect(hasCanonicalBugLabel(issue(4, { labels: ["type: bug"] }))).toBe(false);
    expect(hasCanonicalBugLabel(issue(5, { labels: ["defect"] }))).toBe(false);
    expect(hasCanonicalBugLabel(issue(6, { title: "Bug: broken", labels: [] }))).toBe(false);
  });

  it("counts one open canonical bug with singular wording", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({
        issues: {
          status: "success",
          items: [issue(1, { labels: ["bug"] }), issue(2)],
        },
      }),
    ]);

    expect(summary.issues).toMatchObject({
      openIssueCount: 2,
      openBugCount: 1,
      label: "1 bug · 2 open",
      bugLabel: "1 bug",
      openLabel: "2 open",
    });
  });

  it("excludes closed Issues and Pull Requests even when labeled bug", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({
        issues: {
          status: "success",
          items: [
            issue(1, { labels: ["bug"] }),
            issue(2, { state: "closed", labels: ["bug"] }),
            issue(3, { type: "pull_request", labels: ["bug"] }),
          ],
        },
      }),
    ]);

    expect(summary.issues).toMatchObject({
      openIssueCount: 1,
      openBugCount: 1,
      label: "1 bug · 1 open",
    });
  });

  it("shows total open only when no canonical bugs exist", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({ issues: { status: "success", items: [issue(1), issue(2)] } }),
    ]);

    expect(summary.issues).toMatchObject({
      openIssueCount: 2,
      openBugCount: 0,
      label: "2 open",
      bugLabel: null,
    });
  });

  it("distinguishes a successful zero result from total provider failure", () => {
    const zero = summarizeProjectGitHub(project(), [observation()]);
    const unavailable = summarizeProjectGitHub(project(), [
      observation({
        issues: {
          status: "unavailable",
          error: { code: "provider", message: "Unavailable" },
        },
      }),
    ]);

    expect(zero.issues).toMatchObject({
      status: "complete",
      openIssueCount: 0,
      openBugCount: 0,
      label: "0 open",
    });
    expect(unavailable.issues).toMatchObject({
      status: "unavailable",
      label: "Issues unavailable",
    });
  });

  it("deduplicates an overlapping Issue while retaining repository context", () => {
    const duplicate = issue(1, { labels: ["bug"] });
    const summary = summarizeProjectGitHub(project(), [
      observation({ issues: { status: "success", items: [duplicate] } }),
      observation({
        resourceId: "overlap",
        componentId: "overlap-component",
        componentName: "Overlap",
        issues: { status: "success", items: [duplicate] },
      }),
    ]);

    expect(summary.issues).toMatchObject({
      openIssueCount: 1,
      openBugCount: 1,
    });
    expect(summary.issues.items).toHaveLength(1);
    expect(summary.issues.items[0].component.name).toBe("Desktop");
  });

  it("filters the Workspace Bug view by canonical label only", () => {
    const items = [
      issue(1, { labels: ["bug"] }),
      issue(2, { labels: ["bugfix"] }),
      issue(3),
    ];

    expect(filterProjectIssues(items, "all")).toHaveLength(3);
    expect(filterProjectIssues(items, "bug").map(({ id }) => id)).toEqual(["1"]);
  });

  it("keeps Project-specific Issues and Releases scoped to that Project", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({
        issues: { status: "success", items: [issue(1)] },
        release: { status: "success", item: release("v1.0.0") },
      }),
      observation({
        projectId: "another-project",
        issues: { status: "success", items: [issue(2)] },
        release: { status: "success", item: release("v9.0.0") },
      }),
    ]);

    expect(summary.issues.items.map(({ number }) => number)).toEqual([1]);
    expect(summary.releases.items.map(({ tagName }) => tagName)).toEqual([
      "v1.0.0",
    ]);
  });

  it("uses an unscoped compact Release only for one repository", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({ release: { status: "success", item: release("v0.2.0") } }),
    ]);

    expect(summary.releases).toMatchObject({
      state: "exact",
      releaseBearingRepositoryCount: 1,
      safeCardLabel: "v0.2.0",
      hasSingleSafeProjectRelease: true,
      checkedRepositoryCount: 1,
      failedRepositoryCount: 0,
    });
  });

  it("keeps a lone multi-repository Release explicitly scoped", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({ release: { status: "success", item: release("v0.2.0") } }),
      observation({
        resourceId: "website",
        repository: { fullName: "example/website" },
        componentName: "Website",
        scopeLabel: "Website",
      }),
    ]);

    expect(summary.releases.safeCardLabel).toBe("Desktop · v0.2.0");
    expect(summary.releases.hasSingleSafeProjectRelease).toBe(false);
  });

  it("does not manufacture a Project version from different repository Releases", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({ release: { status: "success", item: release("v0.2.0") } }),
      observation({
        resourceId: "website",
        repository: { fullName: "example/website" },
        componentName: "Website",
        scopeLabel: "Website",
        release: { status: "success", item: release("v1.4.0") },
      }),
    ]);

    expect(summary.releases.items.map((item) => item.tagName)).toEqual([
      "v0.2.0",
      "v1.4.0",
    ]);
    expect(summary.releases.safeCardLabel).toBe("2 component releases");
    expect(summary.releases.hasSingleSafeProjectRelease).toBe(false);
  });

  it("never treats equal component tags as a Product-wide version", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({ release: { status: "success", item: release("v1.0.0") } }),
      observation({
        resourceId: "website",
        repository: { fullName: "example/website" },
        componentId: "website-component",
        componentName: "Website",
        release: {
          status: "success",
          item: release("v1.0.0", "2026-08-25T10:00:00Z", {
            repository: { fullName: "example/website" },
          }),
        },
      }),
    ]);

    expect(summary.releases.safeCardLabel).toBe("2 component releases");
    expect(summary.releases.hasSingleSafeProjectRelease).toBe(false);
  });

  it("marks a published prerelease without hiding it behind an older stable Release", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({
        release: {
          status: "success",
          item: release("v1.2.0-beta.2", "2026-08-26T10:00:00Z", {
            prerelease: true,
          }),
        },
      }),
    ]);

    expect(summary.releases.safeCardLabel).toBe(
      "v1.2.0-beta.2 · pre-release",
    );
    expect(summary.releases.items[0].prerelease).toBe(true);
  });

  it.each([
    ["Git tag", { tags: ["v0.2.0"] }],
    ["package.json", { packageVersion: "0.1.0" }],
    ["VERSION file", { versionFile: "0.2.0" }],
  ])("does not treat %s metadata as a published Release", (_source, metadata) => {
    const summary = summarizeProjectGitHub(
      project({
        components: [{ id: "component-id", currentVersion: "9.9.9" }],
        ...metadata,
      }),
      [observation({ ...metadata, release: { status: "success", item: null } })],
    );

    expect(summary.releases).toMatchObject({
      state: "exact",
      releaseBearingRepositoryCount: 0,
      safeCardLabel: "No release",
      hasSingleSafeProjectRelease: false,
    });
  });

  it("keeps exact no-release distinct from provider unavailability", () => {
    const noRelease = summarizeProjectGitHub(project(), [observation()]);
    const unavailable = summarizeProjectGitHub(project(), [observation({
      release: {
        status: "unavailable",
        error: { code: "provider", message: "Unavailable" },
      },
    })]);

    expect(noRelease.releases).toMatchObject({
      state: "exact",
      safeCardLabel: "No release",
    });
    expect(unavailable.releases).toMatchObject({
      state: "unavailable",
      safeCardLabel: "Release unavailable",
    });
  });

  it("keeps known component evidence while marking a partial release set", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({ release: { status: "success", item: release("v0.3.0") } }),
      observation({
        resourceId: "website",
        repository: { fullName: "example/website" },
        componentId: "website-component",
        componentName: "Website",
        release: {
          status: "unavailable",
          error: { code: "permission", message: "Unavailable" },
        },
      }),
    ]);

    expect(summary.releases).toMatchObject({
      state: "partial",
      safeCardLabel: "Release information incomplete",
      releaseBearingRepositoryCount: 1,
      checkedRepositoryCount: 1,
      failedRepositoryCount: 1,
    });
    expect(summary.releases.repositories[0]).toMatchObject({
      component: { name: "Desktop" },
      repository: { fullName: "example/desktop" },
      latestRelease: { tagName: "v0.3.0" },
    });
    expect(summary.releases.repositories[1]).toMatchObject({
      component: { name: "Website" },
      repository: { fullName: "example/website" },
      providerStatus: "unavailable",
    });
  });

  it("uses repository identity when no Component is associated", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({
        componentId: null,
        componentName: null,
        scopeLabel: "desktop",
        release: { status: "success", item: release("v0.3.0") },
      }),
      observation({
        resourceId: "website",
        repository: { fullName: "example/website" },
        componentId: null,
        componentName: null,
        scopeLabel: "website",
      }),
    ]);

    expect(summary.releases.safeCardLabel).toBe(
      "example/desktop · v0.3.0",
    );
    expect(summary.releases.repositories[0].component).toBeNull();
  });

  it("does not fabricate a multi-repository version when no Releases exist", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation(),
      observation({
        resourceId: "website",
        repository: { fullName: "example/website" },
        componentId: "website-component",
        componentName: "Website",
      }),
    ]);

    expect(summary.releases).toMatchObject({
      state: "exact",
      safeCardLabel: "No releases",
      releaseBearingRepositoryCount: 0,
    });
  });

  it("orders multi-repository Activity and keeps partial coverage explicit", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({
        activity: {
          status: "success",
          items: [
            {
              id: "older",
              sha: "older",
              subject: "docs: Older",
              message: "docs: Older",
              repository: { name: "desktop", fullName: "example/desktop" },
              committedAt: "2026-08-24T10:00:00Z",
            },
          ],
        },
      }),
      observation({
        resourceId: "website",
        componentName: "Website",
        scopeLabel: "Website",
        activity: {
          status: "unavailable",
          error: { code: "rate_limit", message: "Rate limited" },
        },
      }),
    ]);

    expect(summary.activity).toMatchObject({
      status: "partial",
      checkedRepositoryCount: 1,
      failedRepositoryCount: 1,
    });
    expect(summary.activity.items[0]).toMatchObject({
      subject: "docs: Older",
      scopeLabel: "Desktop",
    });
    expect(summary.activity).toMatchObject({
      state: "partial",
      latestCommit: {
        subject: "docs: Older",
        component: { name: "Desktop" },
        repository: { fullName: "example/desktop" },
      },
    });
  });

  it("selects the newest Project commit by timestamp, not response order", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({
        activity: {
          status: "success",
          items: [
            commit("older", "2026-09-01T10:00:00Z"),
            commit("newer", "2026-09-03T10:00:00Z"),
          ],
        },
      }),
      observation({
        resourceId: "website",
        repository: { name: "website", fullName: "example/website" },
        componentId: "website-component",
        componentName: "Website",
        activity: {
          status: "success",
          items: [commit("middle", "2026-09-02T10:00:00Z", {
            repository: { name: "website", fullName: "example/website" },
            repositoryDisplayName: "website",
          })],
        },
      }),
    ]);

    expect(summary.activity).toMatchObject({
      state: "exact",
      latestCommit: {
        sha: "newer",
        subject: "docs: commit newer",
        component: { name: "Desktop" },
        repository: { fullName: "example/desktop" },
      },
    });
  });

  it("falls back to repository identity when the latest commit has no Component", () => {
    const summary = summarizeProjectGitHub(project(), [
      observation({
        componentId: null,
        componentName: null,
        activity: {
          status: "success",
          items: [commit("latest", "2026-09-03T10:00:00Z")],
        },
      }),
    ]);

    expect(summary.activity.latestCommit).toMatchObject({
      component: null,
      repository: { name: "desktop", fullName: "example/desktop" },
    });
  });

  it("distinguishes unavailable, no repository, and successful no-commit states", () => {
    const unavailable = summarizeProjectGitHub(project(), [observation({
      activity: {
        status: "unavailable",
        error: { code: "provider", message: "Unavailable" },
      },
    })]);
    const noRepository = summarizeProjectGitHub(project(), []);
    const noCommits = summarizeProjectGitHub(project(), [observation()]);

    expect(unavailable.activity).toMatchObject({
      state: "unavailable",
      latestCommit: null,
    });
    expect(noRepository.activity).toMatchObject({
      state: "not_connected",
      latestCommit: null,
    });
    expect(noCommits.activity).toMatchObject({
      state: "exact",
      latestCommit: null,
    });
  });
});
