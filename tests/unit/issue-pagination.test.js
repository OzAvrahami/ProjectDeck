import { describe, expect, it, vi } from "vitest";

import {
  composeIssuePage,
  decodeIssuePageCursor,
} from "../../lib/projects/issue-pagination.js";
import { projectIssuesHref } from "../../lib/projects/navigation.js";

vi.mock("server-only", () => ({}));

const repositories = {
  desktop: {
    owner: "owner",
    name: "desktop",
    fullName: "owner/desktop",
  },
  website: {
    owner: "owner",
    name: "website",
    fullName: "owner/website",
  },
};

function issue(id, repository, updatedAt, overrides = {}) {
  return {
    type: "issue",
    id,
    number: Number(id.replace(/\D/g, "")) || 1,
    title: `Issue ${id}`,
    repository,
    url: `https://github.com/${repository.fullName}/issues/${id}`,
    createdAt: updatedAt,
    updatedAt,
    labels: [],
    assignees: [],
    state: "open",
    project: {
      id: "project-1",
      slug: "project",
      name: "Project",
      accent: "250",
    },
    ...overrides,
  };
}

function observation(repository, edges, overrides = {}) {
  return {
    projectId: "project-1",
    resourceId: repository.name,
    repository,
    checkedAt: "2026-09-07T10:00:00.000Z",
    issues: {
      status: "success",
      edges,
      items: edges.map(({ item }) => item),
      totalCount: edges.length,
      bugCount: 0,
      filteredTotalCount: edges.length,
      pageInfo: { hasNextPage: false, endCursor: edges.at(-1)?.cursor ?? null },
      ...overrides,
    },
  };
}

function project(items) {
  return {
    id: "project-1",
    slug: "project",
    githubSummary: { issues: { items } },
  };
}

describe("Issue composite pagination", () => {
  it("merges repositories by timestamp rather than repository order", () => {
    const desktop = [
      { cursor: "d1", item: issue("d1", repositories.desktop, "2026-09-07T09:00:00Z") },
      { cursor: "d2", item: issue("d2", repositories.desktop, "2026-09-07T07:00:00Z") },
    ];
    const website = [
      { cursor: "w1", item: issue("w1", repositories.website, "2026-09-07T10:00:00Z") },
      { cursor: "w2", item: issue("w2", repositories.website, "2026-09-07T08:00:00Z") },
    ];
    const allItems = [...desktop, ...website].map(({ item }) => item);
    const { state } = decodeIssuePageCursor(null, "all");
    const page = composeIssuePage({
      observations: [
        observation(repositories.desktop, desktop),
        observation(repositories.website, website),
      ],
      projects: [project(allItems)],
      state,
      pageSize: 3,
    });

    expect(page.items.map(({ id }) => id)).toEqual(["w1", "d1", "w2"]);
    expect(page.hasNextPage).toBe(true);
    expect(page.nextCursor).toBeTruthy();
  });

  it("retains previous-page state in an opaque filter-bound cursor", () => {
    const edges = [
      { cursor: "one", item: issue("i1", repositories.desktop, "2026-09-07T10:00:00Z") },
      { cursor: "two", item: issue("i2", repositories.desktop, "2026-09-07T09:00:00Z") },
    ];
    const { state } = decodeIssuePageCursor(null, "all");
    const first = composeIssuePage({
      observations: [observation(repositories.desktop, edges, {
        totalCount: 3,
        filteredTotalCount: 3,
        pageInfo: { hasNextPage: true, endCursor: "two" },
      })],
      projects: [project(edges.map(({ item }) => item))],
      state,
      pageSize: 2,
    });
    const decodedNext = decodeIssuePageCursor(first.nextCursor, "all");

    expect(decodedNext.invalid).toBe(false);
    expect(decodedNext.state.offset).toBe(2);
    expect(Object.values(decodedNext.state.positions)).toEqual(["two"]);

    const lastEdge = {
      cursor: "three",
      item: issue("i3", repositories.desktop, "2026-09-07T08:00:00Z"),
    };
    const second = composeIssuePage({
      observations: [observation(repositories.desktop, [lastEdge], {
        totalCount: 3,
        filteredTotalCount: 3,
      })],
      projects: [project([lastEdge.item])],
      state: decodedNext.state,
      pageSize: 2,
    });

    expect(second.visibleStart).toBe(3);
    expect(second.hasPreviousPage).toBe(true);
    expect(decodeIssuePageCursor(second.previousCursor, "all").state).toMatchObject({
      positions: {},
      offset: 0,
    });
    expect(decodeIssuePageCursor(first.nextCursor, "bug").invalid).toBe(true);
  });

  it("preserves provider order for equal timestamps so cursors cannot skip an Issue", () => {
    const timestamp = "2026-09-07T10:00:00Z";
    const edges = [
      { cursor: "provider-first", item: issue("i9", repositories.desktop, timestamp) },
      { cursor: "provider-second", item: issue("i1", repositories.desktop, timestamp) },
    ];
    const { state } = decodeIssuePageCursor(null, "all");
    const page = composeIssuePage({
      observations: [observation(repositories.desktop, edges)],
      projects: [project(edges.map(({ item }) => item))],
      state,
      pageSize: 1,
    });
    const next = decodeIssuePageCursor(page.nextCursor, "all").state;

    expect(page.items.map(({ id }) => id)).toEqual(["i9"]);
    expect(Object.values(next.positions)).toEqual(["provider-first"]);
  });

  it("deduplicates overlapping Issue observations", () => {
    const shared = issue("same", repositories.desktop, "2026-09-07T10:00:00Z");
    const { state } = decodeIssuePageCursor(null, "all");
    const page = composeIssuePage({
      observations: [
        observation(repositories.desktop, [{ cursor: "one", item: shared }]),
        observation(repositories.desktop, [{ cursor: "one", item: shared }]),
      ],
      projects: [project([shared])],
      state,
    });

    expect(page.items).toHaveLength(1);
  });

  it("keeps partial repository evidence explicit and disables navigation", () => {
    const available = issue("ok1", repositories.desktop, "2026-09-07T10:00:00Z");
    const { state } = decodeIssuePageCursor(null, "all");
    const page = composeIssuePage({
      observations: [
        observation(repositories.desktop, [{ cursor: "one", item: available }], {
          totalCount: 8,
          filteredTotalCount: 8,
          pageInfo: { hasNextPage: true, endCursor: "one" },
        }),
        {
          projectId: "project-1",
          resourceId: "website",
          repository: repositories.website,
          checkedAt: "2026-09-07T10:00:00.000Z",
          issues: {
            status: "unavailable",
            error: { code: "permission", message: "Unavailable" },
          },
        },
      ],
      projects: [project([available])],
      state,
    });

    expect(page).toMatchObject({
      status: "partial",
      filteredTotalCount: 8,
      hasNextPage: false,
      hasPreviousPage: false,
      failedRepositoryCount: 1,
    });
  });

  it("resets malformed cursor input to the first page", () => {
    expect(decodeIssuePageCursor("not-a-cursor", "all")).toMatchObject({
      invalid: true,
      state: { positions: {}, offset: 0 },
    });
  });
});

describe("Issue pagination routing", () => {
  it("preserves filter and cursor while filter links naturally reset cursor", () => {
    expect(projectIssuesHref("project", { type: "bug", cursor: "opaque" }))
      .toBe("/projects/project?tab=issues&type=bug&cursor=opaque");
    expect(projectIssuesHref("project", { type: "bug" }))
      .toBe("/projects/project?tab=issues&type=bug");
    expect(projectIssuesHref("project"))
      .toBe("/projects/project?tab=issues");
  });
});
