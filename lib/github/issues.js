import "server-only";

import {
  clarifyGitHubRepositoryEndpointError,
  fetchGitHubGraphQL,
  GitHubProviderError,
} from "./client.js";

export const DEFAULT_ISSUE_PAGE_SIZE = 25;

const ISSUES_PAGE_QUERY = `
  query ProjectDeckRepositoryIssues(
    $owner: String!
    $name: String!
    $first: Int!
    $after: String
    $filterBy: IssueFilters
  ) {
    repository(owner: $owner, name: $name) {
      page: issues(
        first: $first
        after: $after
        states: OPEN
        filterBy: $filterBy
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        totalCount
        pageInfo { hasNextPage endCursor }
        edges {
          cursor
          node {
            id
            number
            title
            url
            state
            createdAt
            updatedAt
            labels(first: 100) { nodes { name } }
            assignees(first: 20) { nodes { login } }
          }
        }
      }
      allOpen: issues(first: 1, states: OPEN) { totalCount }
      bugs: issues(
        first: 1
        states: OPEN
        filterBy: { labels: ["bug"] }
      ) { totalCount }
    }
  }
`;

export function normalizeGitHubIssue(issue, repository) {
  if (!issue || issue.id == null || issue.number == null || !issue.title) {
    throw new Error("GitHub returned an invalid Issue record.");
  }

  return {
    type: "issue",
    id: String(issue.id),
    number: issue.number,
    title: issue.title,
    repository,
    url: issue.url ?? issue.html_url,
    createdAt: issue.createdAt ?? issue.created_at ?? null,
    updatedAt: issue.updatedAt ?? issue.updated_at ?? null,
    labels: (issue.labels?.nodes ?? issue.labels ?? [])
      .map((label) => (typeof label === "string" ? label : label?.name))
      .filter(Boolean),
    assignees: (issue.assignees?.nodes ?? issue.assignees ?? [])
      .map((assignee) => assignee?.login)
      .filter(Boolean),
    state: String(issue.state ?? "open").toLowerCase(),
  };
}

function validPageSize(value) {
  return Number.isInteger(value) && value >= 1 && value <= 100;
}

export async function fetchGitHubIssuePage(
  repository,
  {
    token = process.env.GITHUB_TOKEN,
    fetchImpl = fetch,
    after = null,
    type = "all",
    pageSize = DEFAULT_ISSUE_PAGE_SIZE,
  } = {},
) {
  const size = validPageSize(pageSize) ? pageSize : DEFAULT_ISSUE_PAGE_SIZE;

  try {
    const response = await fetchGitHubGraphQL(
      ISSUES_PAGE_QUERY,
      {
        owner: repository.owner,
        name: repository.name,
        first: size,
        after: typeof after === "string" && after ? after : null,
        filterBy: type === "bug" ? { labels: ["bug"] } : null,
      },
      { token, fetchImpl, capability: "Issues access" },
    );
    const result = response.data.repository;

    if (!result) {
      throw new GitHubProviderError(
        "repository_unavailable",
        "The connected GitHub repository is unavailable to the configured token.",
      );
    }

    if (
      !Array.isArray(result.page?.edges) ||
      !Number.isInteger(result.page?.totalCount) ||
      !Number.isInteger(result.allOpen?.totalCount) ||
      !Number.isInteger(result.bugs?.totalCount) ||
      typeof result.page?.pageInfo?.hasNextPage !== "boolean"
    ) {
      throw new GitHubProviderError(
        "provider",
        "GitHub returned an invalid Issues page.",
      );
    }

    const edges = result.page.edges.map((edge) => {
      if (!edge?.cursor || !edge.node) {
        throw new GitHubProviderError(
          "provider",
          "GitHub returned an invalid Issues page.",
        );
      }

      return {
        cursor: edge.cursor,
        item: normalizeGitHubIssue(edge.node, repository),
      };
    });

    return {
      items: edges.map(({ item }) => item),
      edges,
      totalCount: result.allOpen.totalCount,
      bugCount: result.bugs.totalCount,
      filteredTotalCount: result.page.totalCount,
      pageInfo: {
        hasNextPage: result.page.pageInfo.hasNextPage,
        endCursor: result.page.pageInfo.endCursor ?? null,
      },
      pageSize: size,
      type: type === "bug" ? "bug" : "all",
    };
  } catch (error) {
    await clarifyGitHubRepositoryEndpointError(
      error,
      repository,
      { token, fetchImpl },
      "Issues access",
    );
    throw error;
  }
}

export async function fetchOpenGitHubIssues(
  repository,
  { token = process.env.GITHUB_TOKEN, fetchImpl = fetch } = {},
) {
  const page = await fetchGitHubIssuePage(repository, { token, fetchImpl });
  return page.items;
}
