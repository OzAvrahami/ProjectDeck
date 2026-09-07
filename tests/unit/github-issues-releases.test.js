import { describe, expect, it, vi } from "vitest";

import {
  fetchGitHubIssuePage,
  fetchOpenGitHubIssues,
  normalizeGitHubIssue,
} from "../../lib/github/issues.js";
import {
  fetchLatestPublishedGitHubRelease,
  normalizeGitHubRelease,
} from "../../lib/github/releases.js";
import { parseGitHubRepositoryResource } from "../../lib/github/resource-identity.js";
import { observeProjectsGitHub } from "../../lib/projects/github-observations.js";

vi.mock("server-only", () => ({}));

const repository = {
  owner: "owner",
  name: "project",
  fullName: "owner/project",
  url: "https://github.com/owner/project",
};

function issuePageResponse(
  nodes = [],
  { totalCount = nodes.length, bugCount = 0, hasNextPage = false } = {},
) {
  return new Response(
    JSON.stringify({
      data: {
        repository: {
          page: {
            totalCount,
            pageInfo: {
              hasNextPage,
              endCursor: nodes.length ? `cursor-${nodes.length}` : null,
            },
            edges: nodes.map((node, index) => ({
              cursor: `cursor-${index + 1}`,
              node: {
                id: String(node.id),
                number: node.number,
                title: node.title,
                url: node.html_url,
                state: "OPEN",
                createdAt: node.created_at,
                updatedAt: node.updated_at,
                labels: {
                  nodes: (node.labels ?? []).map((label) => ({
                    name: typeof label === "string" ? label : label.name,
                  })),
                },
                assignees: {
                  nodes: node.assignees ?? [],
                },
              },
            })),
          },
          allOpen: { totalCount },
          bugs: { totalCount: bugCount },
        },
      },
    }),
    { status: 200 },
  );
}

describe("GitHub Resource identity", () => {
  it("derives owner and repository only from a canonical GitHub repository URL", () => {
    expect(
      parseGitHubRepositoryResource({
        provider: "github",
        resourceType: "repository",
        url: "https://github.com/owner/project.git",
      }),
    ).toEqual(repository);

    expect(
      parseGitHubRepositoryResource({
        provider: "github",
        resourceType: "repository",
        url: "https://example.com/owner/project",
      }),
    ).toBeNull();
  });
});

describe("GitHub observation scope", () => {
  it("does not fetch Releases for an Issues-only page composition", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(issuePageResponse());
    const [observed] = await observeProjectsGitHub(
      [
        {
          id: "project-id",
          slug: "project",
          name: "Project",
          accent: "258",
          githubRepositories: [
            {
              id: "resource-id",
              projectId: "project-id",
              componentId: null,
              componentName: null,
              provider: "github",
              resourceType: "repository",
              label: "owner/project",
              url: "https://github.com/owner/project",
            },
          ],
        },
      ],
      { token: "token", fetchImpl, features: ["issues"] },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(observed.githubSummary.issues.status).toBe("complete");
    expect(observed.githubSummary.releases.status).toBe("not_connected");
  });
});

function issue(overrides = {}) {
  return {
    id: 10,
    number: 4,
    title: "Fix the import",
    html_url: "https://github.com/owner/project/issues/4",
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-25T10:00:00Z",
    labels: [{ name: "bug" }],
    assignees: [{ login: "oz" }],
    ...overrides,
  };
}

function release(overrides = {}) {
  return {
    id: 20,
    tag_name: "v1.2.0",
    name: "Version 1.2",
    html_url: "https://github.com/owner/project/releases/tag/v1.2.0",
    published_at: "2026-08-24T10:00:00Z",
    prerelease: false,
    draft: false,
    ...overrides,
  };
}

describe("GitHub Issues", () => {
  it("normalizes only the Issue fields ProjectDeck needs", () => {
    expect(normalizeGitHubIssue(issue(), repository)).toEqual({
      type: "issue",
      id: "10",
      number: 4,
      title: "Fix the import",
      repository,
      url: "https://github.com/owner/project/issues/4",
      createdAt: "2026-08-20T10:00:00Z",
      updatedAt: "2026-08-25T10:00:00Z",
      labels: ["bug"],
      assignees: ["oz"],
      state: "open",
    });
  });

  it("uses the Issue-only GraphQL connection and preserves a successful empty result", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(issuePageResponse([issue()], { bugCount: 1 }))
      .mockResolvedValueOnce(issuePageResponse());

    await expect(
      fetchOpenGitHubIssues(repository, { token: "token", fetchImpl }),
    ).resolves.toHaveLength(1);
    await expect(
      fetchOpenGitHubIssues(repository, { token: "token", fetchImpl }),
    ).resolves.toEqual([]);
  });

  it("returns one bounded page and a provider cursor without draining later pages", async () => {
    const firstPage = Array.from({ length: 25 }, (_, index) =>
      issue({ id: index + 1, number: index + 1 }),
    );
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(issuePageResponse(firstPage, {
        totalCount: 101,
        bugCount: 7,
        hasNextPage: true,
      }));

    const page = await fetchGitHubIssuePage(repository, {
      token: "token",
      fetchImpl,
    });

    expect(page.items).toHaveLength(25);
    expect(page).toMatchObject({
      totalCount: 101,
      bugCount: 7,
      filteredTotalCount: 101,
      pageInfo: { hasNextPage: true },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(request.variables).toMatchObject({ first: 25, after: null });
    expect(request.query).toContain("page: issues(");
  });

  it("passes the next cursor and canonical bug filter to GitHub", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      issuePageResponse([issue()], { totalCount: 12, bugCount: 12 }),
    );

    await fetchGitHubIssuePage(repository, {
      token: "token",
      fetchImpl,
      after: "provider-cursor",
      type: "bug",
    });

    const request = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(request.variables).toMatchObject({
      after: "provider-cursor",
      filterBy: { labels: ["bug"] },
    });
  });

  it("rejects an invalid provider page instead of treating it as final", async () => {
    await expect(
      fetchGitHubIssuePage(repository, {
        token: "token",
        fetchImpl: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ data: { repository: { page: {} } } }), {
            status: 200,
          }),
        ),
      }),
    ).rejects.toMatchObject({ code: "provider" });
  });

  it("distinguishes permission, rate-limit, and provider failures", async () => {
    await expect(
      fetchOpenGitHubIssues(repository, {
        token: "token",
        fetchImpl: vi
          .fn()
          .mockResolvedValue(new Response(null, { status: 403 })),
      }),
    ).rejects.toMatchObject({ code: "permission" });

    await expect(
      fetchOpenGitHubIssues(repository, {
        token: "token",
        fetchImpl: vi.fn().mockResolvedValue(
          new Response(null, {
            status: 403,
            headers: { "x-ratelimit-remaining": "0" },
          }),
        ),
      }),
    ).rejects.toMatchObject({ code: "rate_limit" });

    await expect(
      fetchOpenGitHubIssues(repository, {
        token: "token",
        fetchImpl: vi.fn().mockRejectedValue(new Error("offline")),
      }),
    ).rejects.toMatchObject({ code: "provider" });
  });

  it("distinguishes endpoint permission from repository unavailability", async () => {
    const permissionFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 1 }), { status: 200 }),
      );

    await expect(
      fetchOpenGitHubIssues(repository, {
        token: "token",
        fetchImpl: permissionFetch,
      }),
    ).rejects.toMatchObject({ code: "permission" });

    await expect(
      fetchOpenGitHubIssues(repository, {
        token: "token",
        fetchImpl: vi
          .fn()
          .mockResolvedValue(new Response(null, { status: 404 })),
      }),
    ).rejects.toMatchObject({ code: "repository_unavailable" });
  });
});

describe("GitHub Releases", () => {
  it("normalizes the latest published Release and ignores drafts", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          release({
            id: 21,
            tag_name: "v1.3.0-draft",
            draft: true,
            published_at: "2026-08-25T10:00:00Z",
          }),
          release(),
        ]),
        { status: 200 },
      ),
    );

    await expect(
      fetchLatestPublishedGitHubRelease(repository, {
        token: "token",
        fetchImpl,
      }),
    ).resolves.toEqual(normalizeGitHubRelease(release(), repository));

    expect(normalizeGitHubRelease(release(), repository)).toMatchObject({
      id: "20",
      tag: "v1.2.0",
      tagName: "v1.2.0",
      repository,
      prerelease: false,
      draft: false,
    });
  });

  it("chooses the newest published Release by published_at and keeps prerelease state", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          release({
            id: 21,
            tag_name: "v9.0.0",
            published_at: "2026-08-20T10:00:00Z",
          }),
          release({
            id: 22,
            tag_name: "historical-beta-2",
            published_at: "2026-08-26T10:00:00Z",
            prerelease: true,
          }),
        ]),
        { status: 200 },
      ),
    );

    await expect(
      fetchLatestPublishedGitHubRelease(repository, {
        token: "token",
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      tagName: "historical-beta-2",
      prerelease: true,
      publishedAt: "2026-08-26T10:00:00Z",
    });
  });

  it("rejects malformed published chronology instead of fabricating an order", () => {
    expect(() => normalizeGitHubRelease(release({
      published_at: "not-a-date",
    }), repository)).toThrow("invalid Release record");
  });

  it("treats no published Release as a successful null result", async () => {
    await expect(
      fetchLatestPublishedGitHubRelease(repository, {
        token: "token",
        fetchImpl: vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify([]), { status: 200 }),
          ),
      }),
    ).resolves.toBeNull();
  });

  it("distinguishes Release permission and provider failures", async () => {
    await expect(
      fetchLatestPublishedGitHubRelease(repository, {
        token: "token",
        fetchImpl: vi
          .fn()
          .mockResolvedValue(new Response(null, { status: 403 })),
      }),
    ).rejects.toMatchObject({ code: "permission" });

    await expect(
      fetchLatestPublishedGitHubRelease(repository, {
        token: "token",
        fetchImpl: vi
          .fn()
          .mockResolvedValue(new Response(null, { status: 500 })),
      }),
    ).rejects.toMatchObject({ code: "provider" });
  });
});
