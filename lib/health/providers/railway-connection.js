import "server-only";

import { getActiveProviderConnection } from "../../provider-connections/queries.js";
import { fetchRailwayDeploymentState, RailwayProviderError } from "../../railway/index.js";
import { getRailwayAccessToken } from "../../railway/token-manager.js";
import { healthObservation } from "../model.js";

export const RAILWAY_HEALTH_CONCURRENCY = 4;
export const RAILWAY_HEALTH_TTL_MS = 45_000;
const serviceHealthCache = new Map();

const SUCCESS = new Set(["success", "active", "completed"]);
const TRANSITIONAL = new Set([
  "initializing", "building", "deploying", "waiting", "queued", "sleeping", "removing",
]);

export function railwayServiceDeploymentHealth(deployments = [], activeDeployment = null) {
  const [latest] = deployments;
  if (!latest) {
    return { status: "unknown", reason: "Railway has no deployment state for this service.", evidence: { code: "deployment_state_missing" } };
  }

  const status = String(latest.status ?? "unknown").toLowerCase();
  const active = activeDeployment && SUCCESS.has(String(activeDeployment.status ?? "").toLowerCase())
    ? activeDeployment
    : null;
  const baseEvidence = {
    latestDeploymentId: latest.id,
    latestDeploymentStatus: status,
    latestDeploymentUrl: latest.url,
    latestDeploymentFailed: status === "failed" || status === "crashed",
    activeDeploymentId: active?.id ?? (SUCCESS.has(status) ? latest.id : null),
  };

  if (SUCCESS.has(status)) {
    return { status: "healthy", reason: "Current and latest Railway deployment succeeded.", observedAt: latest.observedStateAt, evidence: baseEvidence };
  }
  if (status === "failed" && active) {
    return {
      status: "degraded",
      reason: "Latest production deployment failed; an earlier successful deployment remains available.",
      observedAt: latest.observedStateAt,
      evidence: { ...baseEvidence, attentionSignal: "latest_deployment_failed" },
    };
  }
  if (status === "failed" || status === "crashed") {
    return {
      status: "down",
      reason: status === "crashed" ? "Current production deployment crashed." : "Production deployment failed with no active successful deployment observed.",
      observedAt: latest.observedStateAt,
      evidence: { ...baseEvidence, attentionSignal: status === "crashed" ? "current_deployment_down" : "latest_deployment_failed" },
    };
  }
  if (TRANSITIONAL.has(status)) {
    return {
      status: "degraded",
      reason: `Railway production deployment is ${status}.`,
      observedAt: latest.observedStateAt,
      evidence: { ...baseEvidence, attentionSignal: "deployment_transitional" },
    };
  }
  return { status: "unknown", reason: `Railway reported ${status || "an unknown deployment state"}.`, observedAt: latest.observedStateAt, evidence: baseEvidence };
}

function associationMonitor(association) {
  return {
    id: association.id,
    label: association.displayName,
    monitorType: "railway_connection",
    enabled: association.enabled,
    affectsProjectHealth: association.affectsProjectHealth,
    providerManaged: true,
    resource: { id: association.externalId, label: association.displayName, url: "https://railway.com", provider: "railway", externalId: association.externalId },
    component: association.component ?? null,
  };
}

function providerErrorObservation(association, message, code) {
  return healthObservation({
    monitor: associationMonitor(association),
    status: "unknown",
    reason: message,
    error: { code },
    evidence: { attentionSignal: "provider_unavailable" },
  });
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export async function observeRailwayConnectionHealth(
  projects,
  {
    connection = undefined,
    fetchImpl = fetch,
    getConnection = getActiveProviderConnection,
    getAccessToken = getRailwayAccessToken,
    fetchDeploymentState = fetchRailwayDeploymentState,
    concurrency = RAILWAY_HEALTH_CONCURRENCY,
    now = () => Date.now(),
  } = {},
) {
  const entries = projects.flatMap((project) =>
    (project.providerAssociations ?? [])
      .filter(({ providerResourceType }) => providerResourceType === "service_environment")
      .map((association) => ({ projectId: project.id, association })),
  );
  if (entries.length === 0) return [];

  const activeConnection = connection === undefined ? await getConnection("railway") : connection;
  if (!activeConnection || activeConnection.connectionState !== "connected") {
    return entries.map(({ projectId, association }) => ({ projectId, observation: providerErrorObservation(association, "Railway needs to be connected again.", "authentication_failed") }));
  }

  let token;
  try {
    token = await getAccessToken(activeConnection.id, { fetchImpl });
  } catch {
    return entries.map(({ projectId, association }) => ({ projectId, observation: providerErrorObservation(association, "Railway access is unavailable; reconnect the integration.", "authentication_failed") }));
  }

  return mapWithConcurrency(entries, concurrency, async ({ projectId, association }) => {
    const monitor = associationMonitor(association);
    if (!association.enabled) {
      return { projectId, observation: healthObservation({ monitor, status: "not_monitored", reason: "This discovered Railway service is disabled." }) };
    }
    try {
      const metadata = association.metadata ?? {};
      const cacheKey = `${activeConnection.id}:${association.externalId}`;
      const cached = serviceHealthCache.get(cacheKey);
      if (
        fetchDeploymentState === fetchRailwayDeploymentState &&
        cached &&
        cached.expiresAt > now()
      ) {
        return { projectId, observation: healthObservation({ monitor, ...cached.result }) };
      }
      const deploymentState = await fetchDeploymentState(
        { projectId: metadata.projectId, environmentId: metadata.environmentId, serviceId: metadata.serviceId },
        { token, fetchImpl },
      );
      const result = railwayServiceDeploymentHealth(
        deploymentState.deployments,
        deploymentState.activeDeployment,
      );
      if (fetchDeploymentState === fetchRailwayDeploymentState) {
        serviceHealthCache.set(cacheKey, {
          result,
          expiresAt: now() + RAILWAY_HEALTH_TTL_MS,
        });
      }
      return { projectId, observation: healthObservation({ monitor, ...result }) };
    } catch (error) {
      const code = error instanceof RailwayProviderError
        ? ({ authentication: "authentication_failed", permission: "permission_denied", rate_limit: "provider_failed" }[error.code] ?? "provider_failed")
        : "provider_failed";
      return { projectId, observation: providerErrorObservation(association, "Railway deployment state is unavailable for this service.", code) };
    }
  });
}
