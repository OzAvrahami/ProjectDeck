import "server-only";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

export class GitHubProviderError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GitHubProviderError";
    this.code = code;
    this.status = details.status ?? null;
    this.rateLimitReset = details.rateLimitReset ?? null;
  }
}

export function hasNextGitHubPage(linkHeader) {
  if (!linkHeader) {
    return null;
  }

  return linkHeader
    .split(",")
    .some((link) => /;\s*rel="next"\s*$/.test(link.trim()));
}

function responseError(response, capability) {
  const details = {
    status: response.status,
    rateLimitReset: response.headers.get("x-ratelimit-reset"),
  };

  if (response.status === 401) {
    return new GitHubProviderError(
      "authentication",
      "GitHub rejected the configured token. Check or replace GITHUB_TOKEN.",
      details,
    );
  }

  const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");

  if (
    response.status === 429 ||
    rateLimitRemaining === "0" ||
    (response.status === 403 && response.headers.has("retry-after"))
  ) {
    return new GitHubProviderError(
      "rate_limit",
      "GitHub's API rate limit has been reached. Try again later.",
      details,
    );
  }

  if (response.status === 403) {
    return new GitHubProviderError(
      "permission",
      `The configured GitHub token does not allow ${capability}.`,
      details,
    );
  }

  if (response.status === 404) {
    return new GitHubProviderError(
      "repository_unavailable",
      "The connected GitHub repository is unavailable to the configured token.",
      details,
    );
  }

  return new GitHubProviderError(
    "provider",
    `GitHub could not provide ${capability}.`,
    details,
  );
}

export async function fetchGitHubJson(
  path,
  {
    token = process.env.GITHUB_TOKEN,
    fetchImpl = fetch,
    capability = "repository data",
  } = {},
) {
  if (!token) {
    throw new GitHubProviderError(
      "missing_token",
      "GITHUB_TOKEN is not configured on the ProjectDeck server.",
    );
  }

  const url = path instanceof URL ? path : new URL(path, GITHUB_API_URL);
  let response;

  try {
    response = await fetchImpl(url, {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "ProjectDeck",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GitHubProviderError(
      "provider",
      `GitHub is unavailable or timed out while loading ${capability}.`,
    );
  }

  if (!response.ok) {
    throw responseError(response, capability);
  }

  try {
    return {
      data: await response.json(),
      link: response.headers.get("link"),
    };
  } catch {
    throw new GitHubProviderError(
      "provider",
      `GitHub returned an unexpected response for ${capability}.`,
      { status: response.status },
    );
  }
}

export function encodeGitHubRepositoryPath(owner, repository) {
  return `${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
}

export async function clarifyGitHubRepositoryEndpointError(
  error,
  repository,
  options,
  capability,
) {
  if (
    !(error instanceof GitHubProviderError) ||
    error.code !== "repository_unavailable"
  ) {
    throw error;
  }

  const repositoryPath = encodeGitHubRepositoryPath(
    repository.owner,
    repository.name,
  );

  try {
    await fetchGitHubJson(`/repos/${repositoryPath}`, {
      ...options,
      capability: "repository metadata",
    });
  } catch (metadataError) {
    if (
      metadataError instanceof GitHubProviderError &&
      metadataError.code === "repository_unavailable"
    ) {
      throw error;
    }

    throw metadataError;
  }

  throw new GitHubProviderError(
    "permission",
    `The configured GitHub token can see the repository but does not allow ${capability}.`,
    { status: error.status },
  );
}
