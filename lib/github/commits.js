import "server-only";

import {
  clarifyGitHubRepositoryEndpointError,
  encodeGitHubRepositoryPath,
  fetchGitHubJson,
} from "./client.js";

const CONVENTIONAL_PREFIX = /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(?:\([^)]*\))?!?:\s*/i;

export function detectCommitKind(message) {
  return String(message ?? "").split(/\r?\n/, 1)[0].match(CONVENTIONAL_PREFIX)?.[1]?.toLowerCase() ?? null;
}

export function formatCommitMessage(message) {
  return (
    String(message ?? "").split(/\r?\n/, 1)[0].trim() ||
    "Commit details unavailable"
  );
}

export function normalizeGitHubCommit(commit, repository) {
  const committedAt =
    commit?.commit?.author?.date ?? commit?.commit?.committer?.date ?? null;
  const subject = formatCommitMessage(commit?.commit?.message);

  if (
    !commit?.sha ||
    !commit?.html_url ||
    !committedAt ||
    Number.isNaN(Date.parse(committedAt))
  ) {
    throw new Error("GitHub returned an invalid commit record.");
  }

  return {
    id: commit.sha,
    sha: commit.sha,
    shortSha: String(commit.sha ?? "").slice(0, 7),
    subject,
    message: subject,
    kind: detectCommitKind(commit.commit?.message),
    repository,
    repositoryDisplayName: repository.name,
    author: commit.commit?.author?.name ?? commit.author?.login ?? null,
    committedAt,
    url: commit.html_url,
    parentShas: (commit.parents ?? []).map(({ sha }) => sha).filter(Boolean),
  };
}

export async function fetchRecentGitHubCommits(
  repository,
  { token, fetchImpl = fetch, limit = 6 } = {},
) {
  const repositoryPath = encodeGitHubRepositoryPath(
    repository.owner,
    repository.name,
  );
  const options = { token, fetchImpl };

  try {
    const { data } = await fetchGitHubJson(
      `/repos/${repositoryPath}/commits?per_page=${Math.min(Math.max(limit, 1), 20)}`,
      { ...options, capability: "recent repository activity" },
    );

    return data.map((commit) => normalizeGitHubCommit(commit, repository));
  } catch (error) {
    return clarifyGitHubRepositoryEndpointError(
      error,
      repository,
      options,
      "recent repository activity",
    );
  }
}
