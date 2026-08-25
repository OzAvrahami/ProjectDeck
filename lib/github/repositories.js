const ACRONYMS = new Set(["ai", "api", "cli", "db", "ml", "os", "sdk", "ui", "ux"]);

function repositoryTimestamp(repository) {
  const value = repository.pushedAt ?? repository.updatedAt;
  const timestamp = value ? Date.parse(value) : 0;

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function repositoryPriority(repository) {
  if (!repository.archived && !repository.fork) {
    return 0;
  }

  if (!repository.archived) {
    return 1;
  }

  return 2;
}

function formatNamePart(part) {
  const lower = part.toLowerCase();

  if (ACRONYMS.has(lower)) {
    return lower.toUpperCase();
  }

  for (const acronym of ACRONYMS) {
    if (lower.length > acronym.length + 1 && lower.endsWith(acronym)) {
      const prefix = lower.slice(0, -acronym.length);
      return `${prefix[0].toUpperCase()}${prefix.slice(1)}${acronym.toUpperCase()}`;
    }
  }

  return `${lower[0]?.toUpperCase() ?? ""}${lower.slice(1)}`;
}

function nameParts(value) {
  return String(value ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
}

export function normalizeGitHubRepository(repository) {
  if (!repository || repository.id == null || !repository.name) {
    throw new Error("GitHub returned an invalid repository record.");
  }

  const fullName = repository.full_name ?? repository.name;

  return {
    id: String(repository.id),
    name: repository.name,
    fullName,
    owner: repository.owner?.login ?? fullName.split("/")[0] ?? "",
    description: repository.description ?? "",
    url: repository.html_url,
    private: Boolean(repository.private),
    visibility: repository.private ? "private" : "public",
    archived: Boolean(repository.archived),
    fork: Boolean(repository.fork),
    defaultBranch: repository.default_branch ?? null,
    language: repository.language ?? null,
    pushedAt: repository.pushed_at ?? null,
    updatedAt: repository.updated_at ?? null,
  };
}

export function prioritizeRepositories(repositories) {
  return [...repositories].sort((left, right) => {
    const priorityDifference =
      repositoryPriority(left) - repositoryPriority(right);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const timestampDifference =
      repositoryTimestamp(right) - repositoryTimestamp(left);

    return timestampDifference || left.fullName.localeCompare(right.fullName);
  });
}

export function filterRepositories(
  repositories,
  { search = "", showArchived = false, showForks = false } = {},
) {
  const query = search.trim().toLowerCase();

  return repositories.filter((repository) => {
    if (repository.archived && !showArchived) {
      return false;
    }

    if (repository.fork && !showForks) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      repository.name,
      repository.fullName,
      repository.description,
      repository.language,
    ].some((value) => value?.toLowerCase().includes(query));
  });
}

export function markImportedRepositories(repositories, connections) {
  const connectionByExternalId = new Map(
    connections.map((connection) => [connection.externalId, connection]),
  );

  return repositories.map((repository) => {
    const connection = connectionByExternalId.get(repository.id);

    return {
      ...repository,
      imported: Boolean(connection),
      importedProjectName: connection?.projectName ?? null,
    };
  });
}

export function suggestProjectName(repositoryName) {
  const parts = nameParts(repositoryName);

  return parts.map(formatNamePart).join(" ") || "New Project";
}

export function suggestGroupProjectName(repositories) {
  if (repositories.length === 0) {
    return "New Project";
  }

  if (repositories.length === 1) {
    return suggestProjectName(repositories[0].name);
  }

  const splitNames = repositories.map((repository) =>
    nameParts(repository.name).map((part) => part.toLowerCase()),
  );
  const shortestLength = Math.min(...splitNames.map((parts) => parts.length));
  const commonParts = [];

  for (let index = 0; index < shortestLength; index += 1) {
    const candidate = splitNames[0][index];

    if (splitNames.every((parts) => parts[index] === candidate)) {
      commonParts.push(candidate);
    } else {
      break;
    }
  }

  return commonParts.length > 0
    ? commonParts.map(formatNamePart).join(" ")
    : suggestProjectName(repositories[0].name);
}

export function suggestComponentName(repository, groupedRepositories) {
  if (groupedRepositories.length < 2) {
    return "";
  }

  const projectName = suggestGroupProjectName(groupedRepositories);
  const projectParts = nameParts(projectName).map((part) => part.toLowerCase());
  const repositoryParts = nameParts(repository.name);
  const remainder = repositoryParts.slice(projectParts.length);

  return remainder.map(formatNamePart).join(" ");
}
