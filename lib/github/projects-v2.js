import "server-only";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const PAGE_SIZE = 100;

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
            nodes { nameWithOwner }
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
          nodes { nameWithOwner }
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
                repository { nameWithOwner }
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
  }
}

function header(response, name) {
  return response.headers?.get?.(name) ?? null;
}

function responseError(response) {
  const details = { status: response.status };

  if (response.status === 401) {
    return new GitHubProjectsProviderError(
      "authentication",
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
      "rate_limit",
      "GitHub Projects rate limit reached.",
      details,
    );
  }

  if (response.status === 403) {
    return new GitHubProjectsProviderError(
      "permission",
      "GITHUB_PROJECTS_TOKEN cannot read the required GitHub Projects data.",
      details,
    );
  }

  return new GitHubProjectsProviderError(
    "provider",
    "GitHub Projects is temporarily unavailable.",
    details,
  );
}

function graphQLError(errors) {
  const messages = errors.map((error) => error.message ?? "").join(" ");
  const permissionFailure = /scope|permission|forbidden|not authorized/i.test(
    messages,
  );

  return new GitHubProjectsProviderError(
    permissionFailure ? "permission" : "provider",
    permissionFailure
      ? "GITHUB_PROJECTS_TOKEN cannot read the required GitHub Projects data."
      : "GitHub Projects returned an incomplete response.",
  );
}

async function fetchGraphQL(
  query,
  variables,
  { token = process.env.GITHUB_PROJECTS_TOKEN, fetchImpl = fetch } = {},
) {
  if (!token) {
    throw new GitHubProjectsProviderError(
      "missing_token",
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
      "provider",
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
      "provider",
      "GitHub Projects returned an unexpected response.",
    );
  }

  if (payload.errors?.length) {
    throw graphQLError(payload.errors);
  }

  return payload.data;
}

function normalizeRepositoryName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function uniqueRepositoryNames(repositories) {
  return [
    ...new Set(
      repositories
        .map((repository) =>
          normalizeRepositoryName(
            repository.fullName ?? repository.nameWithOwner ?? repository,
          ),
        )
        .filter(Boolean),
    ),
  ].sort();
}

function sameRepositorySet(left, right) {
  return (
    left.length === right.length &&
    left.every((repository, index) => repository === right[index])
  );
}

export function resolveGitHubProjectForRepositories(
  connectedRepositories,
  projects,
) {
  const connected = uniqueRepositoryNames(connectedRepositories);

  if (connected.length === 0) {
    return {
      status: "unresolved",
      reason: "no_connected_repositories",
      candidates: [],
    };
  }

  const openProjects = projects.filter((project) => !project.closed);
  const exactMatches = openProjects.filter((project) =>
    sameRepositorySet(
      connected,
      uniqueRepositoryNames(project.linkedRepositories ?? []),
    ),
  );

  if (exactMatches.length === 1) {
    return {
      status: "resolved",
      reason: "exact_repository_set",
      project: exactMatches[0],
      candidates: exactMatches,
    };
  }

  if (exactMatches.length > 1) {
    return {
      status: "ambiguous",
      reason: "multiple_exact_repository_matches",
      candidates: exactMatches,
    };
  }

  const overlaps = openProjects.filter((project) => {
    const linked = new Set(
      uniqueRepositoryNames(project.linkedRepositories ?? []),
    );
    return connected.some((repository) => linked.has(repository));
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
  const repositories = [...project.repositories.nodes];
  let pageInfo = project.repositories.pageInfo;

  while (pageInfo.hasNextPage) {
    const data = await fetchGraphQL(
      PROJECT_REPOSITORIES_QUERY,
      { id: project.id, after: pageInfo.endCursor },
      options,
    );
    const connection = data.node?.repositories;

    if (!connection) {
      throw new GitHubProjectsProviderError(
        "provider",
        "GitHub Projects omitted linked repository data.",
      );
    }

    repositories.push(...connection.nodes);
    pageInfo = connection.pageInfo;
  }

  return repositories.map(({ nameWithOwner }) => nameWithOwner);
}

export async function fetchUserGitHubProjects(options = {}) {
  const projects = [];
  let after = null;

  while (true) {
    const data = await fetchGraphQL(
      LIST_PROJECTS_QUERY,
      { after },
      options,
    );
    const connection = data.viewer?.projectsV2;

    if (!connection) {
      throw new GitHubProjectsProviderError(
        "provider",
        "GitHub Projects omitted the user-owned Project list.",
      );
    }

    for (const project of connection.nodes) {
      projects.push({
        id: project.id,
        number: project.number,
        title: project.title,
        url: project.url,
        closed: project.closed,
        linkedRepositories: await fetchRemainingProjectRepositories(
          project,
          options,
        ),
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

  const values = item.fieldValues?.nodes ?? [];
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
    repository: item.content.repository?.nameWithOwner ?? null,
    number: item.content.number,
    title: item.content.title,
    state: item.content.state?.toLowerCase() ?? null,
    labels: (item.content.labels?.nodes ?? []).map(({ name }) => name),
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

  while (true) {
    const data = await fetchGraphQL(
      PROJECT_ITEMS_QUERY,
      { id: project.id, after },
      options,
    );
    const node = data.node;

    if (!node) {
      throw new GitHubProjectsProviderError(
        "permission",
        "The resolved GitHub Project is no longer accessible.",
      );
    }

    projectNode ??= node;
    rawItems.push(...node.items.nodes);

    if (!node.items.pageInfo.hasNextPage) {
      break;
    }

    after = node.items.pageInfo.endCursor;
  }

  const fields = projectNode.fields.nodes;
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
