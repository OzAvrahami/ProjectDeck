import { describe, expect, it, vi } from "vitest";

import {
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
      .mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200 }),
      );
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

  it("excludes Pull Requests and preserves a successful empty result", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([issue(), issue({ id: 11, pull_request: {} })]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 }),
      );

    await expect(
      fetchOpenGitHubIssues(repository, { token: "token", fetchImpl }),
    ).resolves.toHaveLength(1);
    await expect(
      fetchOpenGitHubIssues(repository, { token: "token", fetchImpl }),
    ).resolves.toEqual([]);
  });

  it("follows Issue pagination", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      issue({ id: index + 1, number: index + 1 }),
    );
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(firstPage), {
          status: 200,
          headers: {
            Link: '<https://api.github.com/repos/owner/project/issues?page=2>; rel="next"',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([issue({ id: 101, number: 101 })]), {
          status: 200,
        }),
      );

    const issues = await fetchOpenGitHubIssues(repository, {
      token: "token",
      fetchImpl,
    });

    expect(issues).toHaveLength(101);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
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
            published_at: null,
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
