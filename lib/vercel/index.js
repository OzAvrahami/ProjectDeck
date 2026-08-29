import "server-only";

const VERCEL_DEPLOYMENTS_URL = "https://api.vercel.com/v6/deployments";

export class VercelProviderError extends Error {
  constructor(code, message, { status = null } = {}) {
    super(message);
    this.name = "VercelProviderError";
    this.code = code;
    this.status = status;
  }
}

export function isVercelConfigured() {
  return Boolean(process.env.VERCEL_TOKEN);
}

export async function fetchLatestVercelProductionDeployment(
  { projectId, teamId = null },
  { token = process.env.VERCEL_TOKEN, fetchImpl = fetch } = {},
) {
  if (!token) {
    throw new VercelProviderError(
      "missing_token",
      "VERCEL_TOKEN is not configured on the ProjectDeck server.",
    );
  }

  const url = new URL(VERCEL_DEPLOYMENTS_URL);
  url.searchParams.set("projectId", projectId);
  url.searchParams.set("target", "production");
  url.searchParams.set("limit", "1");
  if (teamId) url.searchParams.set("teamId", teamId);

  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new VercelProviderError(
      "provider",
      "Vercel is unavailable or timed out.",
    );
  }

  if (response.status === 401) {
    throw new VercelProviderError(
      "authentication",
      "Vercel rejected the configured token.",
      { status: response.status },
    );
  }
  if (response.status === 403) {
    throw new VercelProviderError(
      "permission",
      "The Vercel token cannot read this Project.",
      { status: response.status },
    );
  }
  if (response.status === 429) {
    throw new VercelProviderError(
      "rate_limit",
      "Vercel's API rate limit has been reached.",
      { status: response.status },
    );
  }
  if (!response.ok) {
    throw new VercelProviderError(
      "provider",
      "Vercel could not provide deployment information.",
      { status: response.status },
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new VercelProviderError(
      "provider",
      "Vercel returned an unexpected response.",
    );
  }

  const deployment = payload.deployments?.[0];
  if (!deployment) return null;

  return {
    id: deployment.uid ?? deployment.id ?? null,
    projectId,
    state: String(deployment.readyState ?? deployment.state ?? "UNKNOWN").toLowerCase(),
    createdAt: deployment.created ? new Date(deployment.created).toISOString() : null,
    readyAt: deployment.ready ? new Date(deployment.ready).toISOString() : null,
    url: deployment.url ? `https://${deployment.url}` : null,
    target: deployment.target ?? "production",
  };
}

