import { describe, expect, it, vi } from "vitest";

import {
  fetchRecentGitHubCommits,
  detectCommitKind,
  formatCommitMessage,
  normalizeGitHubCommit,
} from "../../lib/github/commits.js";
import { observeProjectsGitHub } from "../../lib/projects/github-observations.js";

vi.mock("server-only", () => ({}));

const repository = {
  owner: "owner",
  name: "project",
  fullName: "owner/project",
  url: "https://github.com/owner/project",
};

function commit(overrides = {}) {
  return {
    sha: "1234567890abcdef",
    html_url: "https://github.com/owner/project/commit/1234567",
    commit: {
      message: "fix(ui): repair Project card\n\nLong body",
      author: { name: "Developer", date: "2026-08-25T10:00:00Z" },
      committer: { date: "2026-08-25T10:00:00Z" },
    },
    author: { login: "developer" },
    ...overrides,
  };
}

describe("GitHub recent activity", () => {
  it("uses only the first line while preserving conventional prefixes", () => {
    expect(formatCommitMessage("feat(api)!: ship a change\nmore")).toBe(
      "feat(api)!: ship a change",
    );
    expect(formatCommitMessage("plain commit")).toBe("plain commit");
    expect(detectCommitKind("feat(api)!: ship a change")).toBe("feat");
    expect(detectCommitKind("plain commit")).toBeNull();
  });

  it("normalizes a narrow commit representation", () => {
    expect(normalizeGitHubCommit(commit(), repository)).toEqual({
      id: "1234567890abcdef",
      sha: "1234567890abcdef",
      shortSha: "1234567",
      subject: "fix(ui): repair Project card",
      message: "fix(ui): repair Project card",
      kind: "fix",
      repository,
      repositoryDisplayName: "project",
      author: "Developer",
      committedAt: "2026-08-25T10:00:00Z",
      url: "https://github.com/owner/project/commit/1234567",
      parentShas: [],
    });
  });

  it("does not add another commit fetch for Project-level card synthesis", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([commit()]), { status: 200 }),
    );
    const [project] = await observeProjectsGitHub(
      [{
        id: "project-id",
        slug: "project",
        name: "Project",
        accent: "258",
        githubRepositories: [{
          id: "resource-id",
          componentId: null,
          componentName: null,
          provider: "github",
          resourceType: "repository",
          label: "owner/project",
          url: "https://github.com/owner/project",
        }],
      }],
      { token: "token", fetchImpl, features: ["activity"] },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(project.githubSummary.activity.latestCommit.subject).toBe(
      "fix(ui): repair Project card",
    );
  });

  it("requests a small default-branch commit window", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([commit()]), { status: 200 }),
    );

    const result = await fetchRecentGitHubCommits(repository, {
      token: "token",
      fetchImpl,
    });

    expect(result).toHaveLength(1);
    expect(String(fetchImpl.mock.calls[0][0])).toContain(
      "/repos/owner/project/commits?per_page=6",
    );
  });

  it("keeps provider failure scoped", async () => {
    await expect(
      fetchRecentGitHubCommits(repository, {
        token: "token",
        fetchImpl: vi.fn().mockRejectedValue(new Error("offline")),
      }),
    ).rejects.toMatchObject({ code: "provider" });
  });
});
