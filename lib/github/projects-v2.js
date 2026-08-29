import "server-only";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
export const STANDARD_PROJECT_STATUSES = [
  "Backlog",
  "Ready",
  "In Progress",
  "Verify",
  "Done",
];

export const STANDARD_PROJECT_PRIORITIES = [
  "P0 — Critical",
  "P1 — High",
  "P2 — Medium",
  "P3 — Low",
];

const LIST_PROJECTS_QUERY = `
  query ProjectDeckProjects($after: String) {
    viewer {
      projectsV2(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          number
          title
          url
          closed
          repositories(first: 100) {
            totalCount
            pageInfo { hasNextPage endCursor }
            nodes { id databaseId nameWithOwner }
          }
        }
      }
    }
  }
`;

const PROJECT_REPOSITORIES_QUERY = `
  query ProjectDeckProjectRepositories($id: ID!, $after: String) {
    node(id: $id) {
      ... on ProjectV2 {
        repositories(first: 100, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { id databaseId nameWithOwner }
        }
      }
    }
  }
`;

const PROJECT_ITEMS_QUERY = `
  query ProjectDeckProjectItems($id: ID!, $after: String) {
    node(id: $id) {
      ... on ProjectV2 {
        id
        number
        title
        url
        fields(first: 100) {
          nodes {
            __typename
            ... on ProjectV2SingleSelectField {
              name
              options { name }
            }
          }
        }
        items(first: 100, after: $after) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            content {
              __typename
              ... on Issue {
                id
                number
                title
                state
                updatedAt
                url
                repository { id databaseId nameWithOwner }
                labels(first: 100) { nodes { name } }
              }
            }
            fieldValues(first: 100) {
              nodes {
                __typename
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field {
                    ... on ProjectV2SingleSelectField { name }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export class GitHubProjectsProviderError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GitHubProjectsProviderError";
    this.code = code;
    this.status = details.status ?? null;
    this.providerMessages = details.providerMessages ?? [];
  }
}

function header(response, name) {
  return response.headers?.get?.(name) ?? null;
}

function responseError(response) {
  const details = { status: response.status };

  if (response.status === 401) {
    return new GitHubProjectsProviderError(
      "authentication_failed",
      "GitHub rejected GITHUB_PROJECTS_TOKEN.",
      details,
    );
  }

  if (
    response.status === 429 ||
    header(response, "x-ratelimit-remaining") === "0" ||
    (response.status === 403 && header(response, "retry-after"))
  ) {
    return new GitHubProjectsProviderError(
      "provider_failed",
      "GitHub Projects rate limit reached.",
      details,
    );
  }

  if (response.status === 403) {
    return new GitHubProjectsProviderError(
      "permission_denied",
      "GITHUB_PROJECTS_TOKEN cannot read the required GitHub Projects data.",
      details,
    );
  }

  return new GitHubProjectsProviderError(
    "provider_failed",
    "GitHub Projects is temporarily unavailable.",
    details,
  );
}

function graphQLError(errors) {
  const providerErrors = errors?.length
    ? errors
    : [{ message: "GitHub Projects returned no data." }];
  const messages = providerErrors
    .map((error) => error.message ?? "")
    .join(" ");
  const permissionFailure = /scope|permission|forbidden|not authorized/i.test(
    messages,
  );

  return new GitHubProjectsProviderError(
    permissionFailure ? "permission_denied" : "provider_failed",
    permissionFailure
      ? "GITHUB_PROJECTS_TOKEN cannot read the required GitHub Projects data."
      : "GitHub Projects returned an incomplete response.",
    {
      providerMessages: providerErrors.map((error) => error.message ?? ""),
    },
  );
}

async function fetchGraphQL(
  query,
  variables,
  { token = process.env.GITHUB_PROJECTS_TOKEN, fetchImpl = fetch } = {},
) {
  if (!token) {
    throw new GitHubProjectsProviderError(
      "token_missing",
      "GITHUB_PROJECTS_TOKEN is not configured on the ProjectDeck server.",
    );
  }

  let response;

  try {
    response = await fetchImpl(GITHUB_GRAPHQL_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "ProjectDeck",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GitHubProjectsProviderError(
      "provider_failed",
      "GitHub Projects is unavailable or timed out.",
    );
  }

  if (!response.ok) {
    throw responseError(response);
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    throw new GitHubProjectsProviderError(
      "provider_failed",
      "GitHub Projects returned an unexpected response.",
    );
  }

  if (!payload.data) {
    throw graphQLError(payload.errors);
  }

  return {
    data: payload.data,
    errors: payload.errors ?? [],
  };
}

function normalizeRepositoryName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeRepositoryIdentity(repository) {
  if (!repository) {
    return null;
  }

  if (typeof repository === "string") {
    return {
      databaseId: null,
      nodeId: null,
      fullName: normalizeRepositoryName(repository),
    };
  }

  const rawId = repository.databaseId ?? repository.externalId ?? null;
  const fallbackId = repository.id ?? null;
  const databaseId =
    rawId != null
      ? String(rawId)
      : /^\d+$/.test(String(fallbackId ?? ""))
        ? String(fallbackId)
        : null;
  const nodeId =
    repository.nodeId ??
    (fallbackId != null && !/^\d+$/.test(String(fallbackId))
      ? String(fallbackId)
      : null);

  return {
    databaseId,
    nodeId,
    fullName: normalizeRepositoryName(
      repository.fullName ?? repository.nameWithOwner,
    ),
  };
}

function normalizeRepositoryIdentities(repositories) {
  const identities = repositories
    .map(normalizeRepositoryIdentity)
    .filter(Boolean);
  const seen = new Set();

  return identities.filter((identity) => {
    const key =
      identity.databaseId ?? identity.nodeId ?? identity.fullName ?? null;

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function repositoriesMatch(left, right) {
  if (left.databaseId && right.databaseId) {
    return left.databaseId === right.databaseId;
  }

  if (left.nodeId && right.nodeId) {
    return left.nodeId === right.nodeId;
  }

  return Boolean(
    left.fullName && right.fullName && left.fullName === right.fullName,
  );
}

function everyVisibleRepositoryMatches(visible, connected) {
  return visible.every((repository) =>
    connected.some((candidate) => repositoriesMatch(repository, candidate)),
  );
}

function projectRepositoryMatch(project, connected) {
  const visible = normalizeRepositoryIdentities(
    project.linkedRepositories ?? [],
  );
  const totalCount = project.linkedRepositoryCount ?? visible.length;
  const inaccessibleCount = Math.max(totalCount - visible.length, 0);
  const visibleMatches = everyVisibleRepositoryMatches(visible, connected);

  if (
    inaccessibleCount === 0 &&
    totalCount === connected.length &&
    visible.length === connected.length &&
    visibleMatches
  ) {
    return "exact";
  }

  if (
    inaccessibleCount > 0 &&
    visible.length > 0 &&
    totalCount === connected.length &&
    visibleMatches
  ) {
    return "partial_visibility";
  }

  return null;
}

export function resolveGitHubProjectForRepositories(
  connectedRepositories,
  projects,
) {
  const connected = normalizeRepositoryIdentities(connectedRepositories);

  if (connected.length === 0) {
    return {
      status: "unresolved",
      reason: "no_connected_repositories",
      candidates: [],
    };
  }

  const openProjects = projects.filter((project) => !project.closed);
  const matches = openProjects
    .map((project) => ({
      project,
      match: projectRepositoryMatch(project, connected),
    }))
    .filter(({ match }) => match);

  if (matches.length === 1) {
    return {
      status: "resolved",
      reason:
        matches[0].match === "exact"
          ? "exact_repository_set"
          : "repository_set_with_partial_visibility",
      repositoryVisibility:
        matches[0].match === "exact" ? "complete" : "partial",
      project: matches[0].project,
      candidates: [matches[0].project],
    };
  }

  if (matches.length > 1) {
    return {
      status: "ambiguous",
      reason: "multiple_repository_matches",
      candidates: matches.map(({ project }) => project),
    };
  }

  const overlaps = openProjects.filter((project) => {
    const linked = normalizeRepositoryIdentities(
      project.linkedRepositories ?? [],
    );
    return linked.some((repository) =>
      connected.some((candidate) => repositoriesMatch(repository, candidate)),
    );
  });

  if (overlaps.length > 1) {
    return {
      status: "ambiguous",
      reason: "multiple_partial_repository_matches",
      candidates: overlaps,
    };
  }

  return {
    status: "unresolved",
    reason: overlaps.length === 1 ? "repository_set_not_exact" : "no_match",
    candidates: overlaps,
  };
}

async function fetchRemainingProjectRepositories(project, options) {
  const repositories = [...project.repositories.nodes].filter(Boolean);
  let pageInfo = project.repositories.pageInfo;
  const errors = [];

  while (pageInfo.hasNextPage) {
    const result = await fetchGraphQL(
      PROJECT_REPOSITORIES_QUERY,
      { id: project.id, after: pageInfo.endCursor },
      options,
    );
    errors.push(...result.errors);
    const data = result.data;
    const connection = data.node?.repositories;

    if (!connection) {
      throw new GitHubProjectsProviderError(
        "provider_failed",
        "GitHub Projects omitted linked repository data.",
      );
    }

    repositories.push(...connection.nodes.filter(Boolean));
    pageInfo = connection.pageInfo;
  }

  return {
    repositories: repositories.map(({ id, databaseId, nameWithOwner }) => ({
      nodeId: id,
      databaseId: databaseId == null ? null : String(databaseId),
      fullName: nameWithOwner,
    })),
    totalCount: project.repositories.totalCount,
    inaccessibleCount: Math.max(
      project.repositories.totalCount - repositories.length,
      0,
    ),
    partial:
      errors.length > 0 ||
      repositories.length < project.repositories.totalCount,
  };
}

export async function fetchUserGitHubProjects(options = {}) {
  const projects = [];
  let after = null;

  while (true) {
    const result = await fetchGraphQL(
      LIST_PROJECTS_QUERY,
      { after },
      options,
    );
    const data = result.data;
    const connection = data.viewer?.projectsV2;

    if (!connection) {
      throw new GitHubProjectsProviderError(
        "provider_failed",
        "GitHub Projects omitted the user-owned Project list.",
      );
    }

    for (const project of connection.nodes) {
      const repositoryEvidence = await fetchRemainingProjectRepositories(
        project,
        options,
      );

      projects.push({
        id: project.id,
        number: project.number,
        title: project.title,
        url: project.url,
        closed: project.closed,
        linkedRepositories: repositoryEvidence.repositories,
        linkedRepositoryCount: repositoryEvidence.totalCount,
        inaccessibleRepositoryCount: repositoryEvidence.inaccessibleCount,
        repositoryEvidencePartial:
          result.errors.length > 0 || repositoryEvidence.partial,
      });
    }

    if (!connection.pageInfo.hasNextPage) {
      return projects;
    }

    after = connection.pageInfo.endCursor;
  }
}

function optionsMatch(field, expected) {
  return (
    field?.options?.length === expected.length &&
    field.options.every((option, index) => option.name === expected[index])
  );
}

export function normalizeGitHubProjectItem(item) {
  if (item.content?.__typename !== "Issue") {
    return null;
  }

  const values = (item.fieldValues?.nodes ?? []).filter(Boolean);
  const status = values.find(
    (value) =>
      value.__typename === "ProjectV2ItemFieldSingleSelectValue" &&
      value.field?.name === "Status",
  )?.name ?? null;
  const priority = values.find(
    (value) =>
      value.__typename === "ProjectV2ItemFieldSingleSelectValue" &&
      value.field?.name === "Priority",
  )?.name ?? null;

  return {
    id: item.content.id,
    itemId: item.id,
    repositoryId: item.content.repository?.id ?? null,
    repositoryDatabaseId:
      item.content.repository?.databaseId == null
        ? null
        : String(item.content.repository.databaseId),
    repository: item.content.repository?.nameWithOwner ?? null,
    number: item.content.number,
    title: item.content.title,
    state: item.content.state?.toLowerCase() ?? null,
    labels: (item.content.labels?.nodes ?? [])
      .filter(Boolean)
      .map(({ name }) => name),
    updatedAt: item.content.updatedAt ?? null,
    url: item.content.url,
    status,
    priority,
    statusRecognized: STANDARD_PROJECT_STATUSES.includes(status),
    priorityRecognized:
      priority === null || STANDARD_PROJECT_PRIORITIES.includes(priority),
  };
}

export async function fetchGitHubProjectReadModel(project, options = {}) {
  let after = null;
  let projectNode = null;
  const rawItems = [];
  const partialErrors = [];

  while (true) {
    const result = await fetchGraphQL(
      PROJECT_ITEMS_QUERY,
      { id: project.id, after },
      options,
    );
    partialErrors.push(...result.errors);
    const data = result.data;
    const node = data.node;

    if (!node) {
      throw new GitHubProjectsProviderError(
        "permission_denied",
        "The resolved GitHub Project is no longer accessible.",
      );
    }

    projectNode ??= node;
    rawItems.push(...node.items.nodes.filter(Boolean));

    if (!node.items.pageInfo.hasNextPage) {
      break;
    }

    after = node.items.pageInfo.endCursor;
  }

  const fields = projectNode.fields.nodes.filter(Boolean);
  const statusField = fields.find(
    (field) =>
      field.__typename === "ProjectV2SingleSelectField" &&
      field.name === "Status",
  );
  const priorityField = fields.find(
    (field) =>
      field.__typename === "ProjectV2SingleSelectField" &&
      field.name === "Priority",
  );

  return {
    id: projectNode.id,
    number: projectNode.number,
    title: projectNode.title,
    url: projectNode.url,
    linkedRepositories: project.linkedRepositories,
    linkedRepositoryCount: project.linkedRepositoryCount,
    repositoryEvidencePartial: project.repositoryEvidencePartial,
    partial: partialErrors.length > 0,
    statusField: {
      available: Boolean(statusField),
      standard: optionsMatch(statusField, STANDARD_PROJECT_STATUSES),
      options: statusField?.options.map(({ name }) => name) ?? [],
    },
    priorityField: {
      available: Boolean(priorityField),
      standard: optionsMatch(priorityField, STANDARD_PROJECT_PRIORITIES),
      options: priorityField?.options.map(({ name }) => name) ?? [],
    },
    items: rawItems.map(normalizeGitHubProjectItem).filter(Boolean),
    totalItemCount: projectNode.items.totalCount,
  };
}
