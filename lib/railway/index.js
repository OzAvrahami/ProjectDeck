import "server-only";

const RAILWAY_API_URL = "https://backboard.railway.app/graphql/v2";

export class RailwayProviderError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RailwayProviderError";
    this.code = code;
    this.status = details.status ?? null;
  }
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

async function railwayGraphQL(
  query,
  variables,
  { token = process.env.RAILWAY_TOKEN, fetchImpl = fetch } = {},
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
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new RailwayProviderError(
      "provider",
      "Railway is unavailable or timed out.",
    );
  }

  if (response.status === 401) {
    throw new RailwayProviderError(
      "authentication",
      "Railway rejected the configured token.",
      { status: response.status },
    );
  }

  if (response.status === 403) {
    throw new RailwayProviderError(
      "permission",
      "The Railway token cannot read this service.",
      { status: response.status },
    );
  }

  if (response.status === 429) {
    throw new RailwayProviderError(
      "rate_limit",
      "Railway's API rate limit has been reached.",
      { status: response.status },
    );
  }

  if (!response.ok) {
    throw new RailwayProviderError(
      "provider",
      "Railway could not provide deployment information.",
      { status: response.status },
    );
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    throw new RailwayProviderError(
      "provider",
      "Railway returned an unexpected response.",
    );
  }

  if (payload.errors?.length) {
    const message = payload.errors.map((error) => error.message).join(" ");
    const lowered = message.toLowerCase();
    const code =
      lowered.includes("permission") || lowered.includes("access")
        ? "permission"
        : "provider";
    throw new RailwayProviderError(
      code,
      code === "permission"
        ? "The Railway token cannot read this service."
        : "Railway could not provide deployment information.",
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
