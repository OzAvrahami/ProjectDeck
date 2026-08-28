import { describe, expect, it, vi } from "vitest";

import {
  fetchRecentGitHubCommits,
  detectCommitKind,
  formatCommitMessage,
  normalizeGitHubCommit,
} from "../../lib/github/commits.js";

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
  it("formats only the first line and strips conventional prefixes", () => {
    expect(formatCommitMessage("feat(api)!: ship a change\nmore")).toBe(
      "ship a change",
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
      message: "repair Project card",
      kind: "fix",
      repository,
      author: "Developer",
      committedAt: "2026-08-25T10:00:00Z",
      url: "https://github.com/owner/project/commit/1234567",
    });
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
