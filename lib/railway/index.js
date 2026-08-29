import "server-only";

export const RAILWAY_API_URL = "https://backboard.railway.com/graphql/v2";

export class RailwayProviderError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RailwayProviderError";
    this.code = code;
    this.status = details.status ?? null;
    this.operationName = details.operationName ?? null;
    this.graphqlErrors = details.graphqlErrors ?? [];
    this.stage = details.stage ?? null;
  }
}

function operationNameFor(query) {
  return String(query).match(/\b(?:query|mutation)\s+([A-Za-z0-9_]+)/)?.[1] ?? null;
}

function normalizeGraphQLErrors(errors = []) {
  return errors.map((error) => ({
    message: String(error?.message ?? "Railway GraphQL request failed."),
    code: error?.extensions?.code ?? null,
    path: Array.isArray(error?.path) ? error.path : null,
  }));
}

function errorCodeForResponse(status, graphqlErrors) {
  if (status === 401) return "authentication";
  if (status === 403) return "permission";
  if (status === 429) return "rate_limit";
  const values = graphqlErrors.flatMap(({ message, code }) => [message, code])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (
    values.includes("unauth") ||
    values.includes("not authorized") ||
    values.includes("invalid token")
  ) {
    return "authentication";
  }
  if (values.includes("permission") || values.includes("forbidden") || values.includes("access denied")) {
    return "permission";
  }
  return graphqlErrors.length > 0 ? "graphql" : "provider";
}

export function isRailwayConfigured() {
  return Boolean(process.env.RAILWAY_TOKEN);
}

export function railwayExternalId({ projectId, environmentId, serviceId }) {
  return `${projectId}:${environmentId}:${serviceId}`;
}

export function parseRailwayResource(resource) {
  if (resource?.provider !== "railway" || !resource.externalId) {
    return null;
  }

  const [projectId, environmentId, serviceId, ...rest] =
    resource.externalId.split(":");

  if (!projectId || !environmentId || !serviceId || rest.length > 0) {
    return null;
  }

  return { projectId, environmentId, serviceId };
}

export async function railwayGraphQL(
  query,
  variables,
  {
    token = process.env.RAILWAY_TOKEN,
    fetchImpl = fetch,
    operationName = operationNameFor(query),
  } = {},
) {
  if (!token) {
    throw new RailwayProviderError(
      "missing_token",
      "RAILWAY_TOKEN is not configured on the ProjectDeck server.",
    );
  }

  let response;

  try {
    response = await fetchImpl(RAILWAY_API_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables, operationName }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new RailwayProviderError(
      "provider",
      "Railway is unavailable or timed out.",
    );
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    const code = errorCodeForResponse(response.status, []);
    throw new RailwayProviderError(
      code,
      code === "authentication"
        ? "Railway rejected the configured authorization."
        : code === "permission"
          ? "The Railway authorization cannot read this resource."
          : "Railway returned an unexpected response.",
      { status: response.status, operationName },
    );
  }

  const graphqlErrors = normalizeGraphQLErrors(payload.errors);
  if (!response.ok || graphqlErrors.length > 0) {
    const code = errorCodeForResponse(response.status, graphqlErrors);
    throw new RailwayProviderError(
      code,
      code === "authentication"
        ? "Railway rejected the configured authorization."
        : code === "permission"
          ? "The Railway authorization cannot read this resource."
          : code === "rate_limit"
            ? "Railway's API rate limit has been reached."
            : "Railway could not provide the requested data.",
      { status: response.status, operationName, graphqlErrors },
    );
  }

  return payload.data;
}

const LATEST_DEPLOYMENT_QUERY = `
  query LatestDeployment($input: DeploymentListInput!) {
    deployments(first: 1, input: $input) {
      edges {
        node {
          id
          projectId
          environmentId
          serviceId
          status
          createdAt
          updatedAt
          statusUpdatedAt
          url
        }
      }
    }
  }
`;

const RECENT_DEPLOYMENTS_QUERY = `
  query RecentDeployments($input: DeploymentListInput!, $first: Int!) {
    deployments(first: $first, input: $input) {
      edges {
        node {
          id
          projectId
          environmentId
          serviceId
          status
          createdAt
          updatedAt
          statusUpdatedAt
          url
        }
      }
    }
  }
`;

const ACTIVE_DEPLOYMENT_QUERY = `
  query ActiveDeployments($environmentId: String!, $serviceId: String!) {
    serviceInstance(environmentId: $environmentId, serviceId: $serviceId) {
      activeDeployments {
        id projectId environmentId serviceId status createdAt updatedAt statusUpdatedAt url
      }
    }
  }
`;

export function normalizeRailwayDeployment(deployment) {
  if (!deployment) {
    return null;
  }

  return {
    id: deployment.id,
    projectId: deployment.projectId,
    environmentId: deployment.environmentId,
    serviceId: deployment.serviceId,
    status: String(deployment.status ?? "UNKNOWN").toLowerCase(),
    createdAt: deployment.createdAt ?? null,
    observedStateAt:
      deployment.statusUpdatedAt ??
      deployment.updatedAt ??
      deployment.createdAt ??
      null,
    url: deployment.url ?? null,
  };
}

function normalizeObservedDeployment(deployment, identity, operationName) {
  const normalized = normalizeRailwayDeployment(deployment);
  if (!normalized) return null;
  if (!normalized.id || !normalized.status || normalized.status === "unknown") {
    throw new RailwayProviderError(
      "normalization_failed",
      "Railway returned incomplete deployment data.",
      { operationName },
    );
  }
  if (
    normalized.projectId !== identity.projectId ||
    normalized.environmentId !== identity.environmentId ||
    normalized.serviceId !== identity.serviceId
  ) {
    throw new RailwayProviderError(
      "invalid_association",
      "Railway returned deployment data for a different resource.",
      { operationName },
    );
  }
  return normalized;
}

function isMissingServiceInstance(error) {
  return error instanceof RailwayProviderError &&
    error.operationName === "ActiveDeployments" &&
    error.graphqlErrors.some(({ message }) =>
      message.toLowerCase().includes("serviceinstance not found"),
    );
}

export function railwayDeploymentLabel(status) {
  const labels = {
    success: "Latest deployment succeeded",
    failed: "Latest deployment failed",
    crashed: "Latest deployment crashed",
    building: "Deployment building",
    deploying: "Deployment in progress",
    waiting: "Deployment waiting",
    queued: "Deployment queued",
    sleeping: "Deployment sleeping",
    removed: "Latest deployment removed",
    skipped: "Latest deployment skipped",
  };

  return labels[status] ?? "Deployment state unavailable";
}

export async function fetchLatestRailwayDeployment(identity, options = {}) {
  const data = await railwayGraphQL(
    LATEST_DEPLOYMENT_QUERY,
    {
      input: {
        projectId: identity.projectId,
        environmentId: identity.environmentId,
        serviceId: identity.serviceId,
      },
    },
    options,
  );

  return normalizeRailwayDeployment(
    data.deployments?.edges?.[0]?.node ?? null,
  );
}

export async function fetchRailwayDeployments(
  identity,
  { limit = 10, ...options } = {},
) {
  const data = await railwayGraphQL(
    RECENT_DEPLOYMENTS_QUERY,
    {
      input: {
        projectId: identity.projectId,
        environmentId: identity.environmentId,
        serviceId: identity.serviceId,
      },
      first: Math.min(Math.max(Number(limit) || 10, 1), 20),
    },
    options,
  );

  return (data.deployments?.edges ?? [])
    .map(({ node }) => normalizeRailwayDeployment(node))
    .filter(Boolean);
}

export async function fetchRailwayDeploymentState(
  identity,
  { limit = 10, ...options } = {},
) {
  const baseInput = {
    projectId: identity.projectId,
    environmentId: identity.environmentId,
    serviceId: identity.serviceId,
  };
  const [recentResult, activeResult] = await Promise.allSettled([
    railwayGraphQL(
      RECENT_DEPLOYMENTS_QUERY,
      {
        input: baseInput,
        first: Math.min(Math.max(Number(limit) || 10, 1), 20),
      },
      { ...options, operationName: "RecentDeployments" },
    ),
    railwayGraphQL(
      ACTIVE_DEPLOYMENT_QUERY,
      {
        environmentId: identity.environmentId,
        serviceId: identity.serviceId,
      },
      { ...options, operationName: "ActiveDeployments" },
    ),
  ]);

  if (recentResult.status === "rejected") {
    const error = recentResult.reason;
    if (error instanceof RailwayProviderError) {
      error.stage = "latest";
      throw error;
    }
    throw new RailwayProviderError(
      "provider",
      "Railway could not provide the latest deployment.",
      { operationName: "RecentDeployments", stage: "latest" },
    );
  }

  const deployments = (recentResult.value.deployments?.edges ?? [])
    .map(({ node }) =>
      normalizeObservedDeployment(node, identity, "RecentDeployments"),
    )
    .filter(Boolean);
  let activeDeployment = null;
  let partialError = null;

  if (activeResult.status === "fulfilled") {
    const activeDeployments = (activeResult.value.serviceInstance?.activeDeployments ?? [])
      .map((deployment) =>
        normalizeObservedDeployment(deployment, identity, "ActiveDeployments"),
      )
      .filter(Boolean);
    activeDeployment = activeDeployments.find(
      (deployment) => deployment.status === "success",
    ) ?? null;
  } else {
    const error = activeResult.reason;
    partialError = isMissingServiceInstance(error)
      ? null
      : error instanceof RailwayProviderError
      ? {
          code: error.code,
          status: error.status,
          operationName: error.operationName,
          graphqlErrors: error.graphqlErrors,
        }
      : {
          code: "provider",
          status: null,
          operationName: "ActiveDeployments",
          graphqlErrors: [],
        };
  }

  return {
    deployments,
    activeDeployment,
    partialError,
  };
}
