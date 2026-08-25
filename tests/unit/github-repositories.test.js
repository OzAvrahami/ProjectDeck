import { describe, expect, it, vi } from "vitest";

import {
  filterRepositories,
  markImportedRepositories,
  normalizeGitHubRepository,
  suggestComponentName,
  suggestGroupProjectName,
  suggestProjectName,
} from "../../lib/github/repositories.js";

vi.mock("server-only", () => ({}));

function githubRepository(overrides = {}) {
  return {
    id: 123,
    name: "limitpact-desktop",
    full_name: "oz/limitpact-desktop",
    owner: { login: "oz" },
    description: "Desktop client",
    html_url: "https://github.com/oz/limitpact-desktop",
    private: true,
    archived: false,
    fork: false,
    default_branch: "main",
    language: "JavaScript",
    pushed_at: "2026-08-24T10:00:00Z",
    updated_at: "2026-08-24T11:00:00Z",
    ...overrides,
  };
}

describe("GitHub repository discovery logic", () => {
  it("normalizes only repository discovery fields", () => {
    expect(normalizeGitHubRepository(githubRepository())).toEqual({
      id: "123",
      name: "limitpact-desktop",
      fullName: "oz/limitpact-desktop",
      owner: "oz",
      description: "Desktop client",
      url: "https://github.com/oz/limitpact-desktop",
      private: true,
      visibility: "private",
      archived: false,
      fork: false,
      defaultBranch: "main",
      language: "JavaScript",
      pushedAt: "2026-08-24T10:00:00Z",
      updatedAt: "2026-08-24T11:00:00Z",
    });
  });

  it("hides archived repositories and forks by default", () => {
    const repositories = [
      normalizeGitHubRepository(githubRepository()),
      normalizeGitHubRepository(
        githubRepository({ id: 124, name: "archive", archived: true }),
      ),
      normalizeGitHubRepository(
        githubRepository({ id: 125, name: "fork", fork: true }),
      ),
    ];

    expect(filterRepositories(repositories).map(({ id }) => id)).toEqual([
      "123",
    ]);
    expect(
      filterRepositories(repositories, {
        showArchived: true,
        showForks: true,
      }),
    ).toHaveLength(3);
  });

  it("marks matching external identities as already imported", () => {
    const [repository] = markImportedRepositories(
      [normalizeGitHubRepository(githubRepository())],
      [
        {
          externalId: "123",
          projectId: "project-id",
          projectName: "LimitPact",
        },
      ],
    );

    expect(repository.imported).toBe(true);
    expect(repository.importedProjectName).toBe("LimitPact");
  });

  it("offers deterministic names without grouping automatically", () => {
    const repositories = [
      normalizeGitHubRepository(githubRepository()),
      normalizeGitHubRepository(
        githubRepository({
          id: 124,
          name: "limitpact-website",
          full_name: "oz/limitpact-website",
        }),
      ),
    ];

    expect(suggestProjectName("lifeos")).toBe("LifeOS");
    expect(suggestGroupProjectName(repositories)).toBe("Limitpact");
    expect(suggestComponentName(repositories[0], repositories)).toBe(
      "Desktop",
    );
    expect(suggestComponentName(repositories[1], repositories)).toBe(
      "Website",
    );
  });
});

describe("GitHub API client", () => {
  it("distinguishes missing credentials from an empty successful scan", async () => {
    const { discoverGitHubRepositories } = await import(
      "../../lib/github/index.js"
    );

    await expect(
      discoverGitHubRepositories({ token: "", fetchImpl: vi.fn() }),
    ).rejects.toMatchObject({ code: "missing_token" });

    await expect(
      discoverGitHubRepositories({
        token: "test-token",
        fetchImpl: vi.fn().mockResolvedValue(
          new Response(JSON.stringify([]), { status: 200 }),
        ),
      }),
    ).resolves.toEqual([]);
  });

  it("distinguishes authentication and rate-limit failures", async () => {
    const { discoverGitHubRepositories } = await import(
      "../../lib/github/index.js"
    );

    await expect(
      discoverGitHubRepositories({
        token: "expired-token",
        fetchImpl: vi
          .fn()
          .mockResolvedValue(new Response(null, { status: 401 })),
      }),
    ).rejects.toMatchObject({ code: "authentication" });

    await expect(
      discoverGitHubRepositories({
        token: "limited-token",
        fetchImpl: vi.fn().mockResolvedValue(
          new Response(null, {
            status: 403,
            headers: { "x-ratelimit-remaining": "0" },
          }),
        ),
      }),
    ).rejects.toMatchObject({ code: "rate_limit" });
  });

  it("follows pagination without exposing the token in results", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      githubRepository({ id: index + 1, name: `repo-${index + 1}` }),
    );
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(firstPage), {
          headers: {
            Link: '<https://api.github.com/user/repos?page=2>; rel="next"',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([githubRepository({ id: 101 })])),
      );
    const { discoverGitHubRepositories } = await import(
      "../../lib/github/index.js"
    );

    const repositories = await discoverGitHubRepositories({
      token: "test-token",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(repositories).toHaveLength(101);
    expect(JSON.stringify(repositories)).not.toContain("test-token");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer test-token",
    );
  });
});
