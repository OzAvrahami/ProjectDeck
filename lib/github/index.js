import "server-only";

import {
  normalizeGitHubRepository,
  prioritizeRepositories,
} from "./repositories.js";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const PAGE_SIZE = 100;

export class GitHubDiscoveryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GitHubDiscoveryError";
    this.code = code;
  }
}

export function isGitHubConfigured() {
  return Boolean(process.env.GITHUB_TOKEN);
}

function hasNextPage(linkHeader) {
  if (!linkHeader) {
    return null;
  }

  return linkHeader
    .split(",")
    .some((link) => /;\s*rel="next"\s*$/.test(link.trim()));
}

function mapResponseError(response) {
  if (response.status === 401) {
    return new GitHubDiscoveryError(
      "authentication",
      "GitHub rejected the configured token. Check or replace GITHUB_TOKEN.",
    );
  }

  const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");

  if (
    response.status === 429 ||
    rateLimitRemaining === "0" ||
    (response.status === 403 && response.headers.has("retry-after"))
  ) {
    return new GitHubDiscoveryError(
      "rate_limit",
      "GitHub's API rate limit has been reached. Try the scan again later.",
    );
  }

  return new GitHubDiscoveryError(
    "provider",
    "GitHub could not complete the repository scan. Try again shortly.",
  );
}

export async function discoverGitHubRepositories({
  token = process.env.GITHUB_TOKEN,
  fetchImpl = fetch,
} = {}) {
  if (!token) {
    throw new GitHubDiscoveryError(
      "missing_token",
      "Add GITHUB_TOKEN to the local server environment before scanning GitHub.",
    );
  }

  const repositories = [];
  let page = 1;

  try {
    while (true) {
      const url = new URL("/user/repos", GITHUB_API_URL);
      url.searchParams.set("affiliation", "owner,collaborator,organization_member");
      url.searchParams.set("direction", "desc");
      url.searchParams.set("page", String(page));
      url.searchParams.set("per_page", String(PAGE_SIZE));
      url.searchParams.set("sort", "pushed");

      const response = await fetchImpl(url, {
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "ProjectDeck",
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        throw mapResponseError(response);
      }

      const pageRepositories = await response.json();

      if (!Array.isArray(pageRepositories)) {
        throw new GitHubDiscoveryError(
          "provider",
          "GitHub returned an unexpected repository response.",
        );
      }

      repositories.push(...pageRepositories.map(normalizeGitHubRepository));

      const linkHasNextPage = hasNextPage(response.headers.get("link"));

      if (
        linkHasNextPage === false ||
        (linkHasNextPage === null && pageRepositories.length < PAGE_SIZE)
      ) {
        break;
      }

      page += 1;
    }
  } catch (error) {
    if (error instanceof GitHubDiscoveryError) {
      throw error;
    }

    throw new GitHubDiscoveryError(
      "provider",
      "GitHub is unavailable or the repository scan timed out. Try again shortly.",
    );
  }

  return prioritizeRepositories(repositories);
}
