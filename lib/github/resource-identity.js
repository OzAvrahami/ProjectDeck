const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const REPOSITORY_PART = /^[a-zA-Z0-9._-]+$/;

export function parseGitHubRepositoryResource(resource) {
  if (
    resource?.provider !== "github" ||
    resource?.resourceType !== "repository" ||
    !resource.url
  ) {
    return null;
  }

  try {
    const url = new URL(resource.url);

    if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
      return null;
    }

    const parts = url.pathname
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));

    if (parts.length !== 2) {
      return null;
    }

    const owner = parts[0];
    const repository = parts[1].replace(/\.git$/i, "");

    if (
      !owner ||
      !repository ||
      !REPOSITORY_PART.test(owner) ||
      !REPOSITORY_PART.test(repository)
    ) {
      return null;
    }

    return {
      owner,
      name: repository,
      fullName: `${owner}/${repository}`,
      url: `https://github.com/${owner}/${repository}`,
    };
  } catch {
    return null;
  }
}
