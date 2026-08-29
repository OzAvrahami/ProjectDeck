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

export function clearRailwayHealthCache(cache = serviceHealthCache) {
  cache.clear();
}

export function railwayServiceDeploymentHealth(deployments = [], activeDeployment = null) {
  const [latest] = deployments;
  if (!latest) {
    return {
      status: "unknown",
      reason: "No Railway deployment exists for this service.",
      evidence: { code: "deployment_not_found" },
      error: { code: "deployment_not_found" },
    };
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

  if (SUCCESS.has(status) && active) {
    return { status: "healthy", reason: "Current and latest Railway deployment succeeded.", observedAt: latest.observedStateAt, evidence: baseEvidence };
  }
  if (SUCCESS.has(status) && !active) {
    return {
      status: "unknown",
      reason: "Railway reported a successful latest deployment but no active deployment.",
      observedAt: latest.observedStateAt,
      evidence: { ...baseEvidence, code: "active_deployment_not_found" },
      error: { code: "active_deployment_not_found" },
    };
  }
  if ((status === "failed" || status === "crashed") && active) {
    return {
      status: "degraded",
      reason: `Latest production deployment ${status}; an earlier successful deployment remains available.`,
      observedAt: latest.observedStateAt,
      evidence: {
        ...baseEvidence,
        attentionSignal:
          status === "crashed"
            ? "latest_deployment_crashed"
            : "latest_deployment_failed",
      },
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
  if ((status === "skipped" || status === "removed") && active) {
    return {
      status: "healthy",
      reason:
        status === "skipped"
          ? "Latest Railway attempt was skipped; an active deployment remains healthy."
          : "A Railway deployment was removed; an active deployment remains healthy.",
      observedAt: latest.observedStateAt,
      evidence: baseEvidence,
    };
  }
  if (status === "removed") {
    return {
      status: "down",
      reason: "Railway has no active deployment after the latest deployment was removed.",
      observedAt: latest.observedStateAt,
      evidence: { ...baseEvidence, attentionSignal: "current_deployment_down" },
    };
  }
  if (status === "skipped") {
    return {
      status: "unknown",
      reason: "Railway skipped the latest attempt and no active deployment was observed.",
      observedAt: latest.observedStateAt,
      evidence: { ...baseEvidence, code: "active_deployment_not_found" },
      error: { code: "active_deployment_not_found" },
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

function hasAssociationIdentity(metadata) {
  return [metadata?.projectId, metadata?.environmentId, metadata?.serviceId]
    .every((value) => typeof value === "string" && value.length > 0);
}

function connectionContainsAssociation(connection, metadata) {
  const workspaces = connection?.displayMetadata?.workspaces;
  if (!Array.isArray(workspaces) || workspaces.length === 0) return true;
  return workspaces.some((workspace) =>
    (workspace.projects ?? []).some((project) =>
      project.id === metadata.projectId &&
      (project.environments ?? []).some(
        (environment) => environment.id === metadata.environmentId,
      ) &&
      (project.services ?? []).some(
        (service) => service.id === metadata.serviceId,
      ),
    ),
  );
}

function observationFailure(error) {
  if (!(error instanceof RailwayProviderError)) {
    return {
      code: "provider_failed",
      message: "Railway deployment data could not be read.",
    };
  }
  const code = {
    authentication: "authentication_failed",
    permission: "permission_denied",
    invalid_association: "invalid_association",
    normalization_failed: "normalization_failed",
    graphql: "deployment_query_failed",
    rate_limit: "provider_failed",
    provider: "deployment_query_failed",
  }[error.code] ?? "provider_failed";
  return {
    code,
    message:
      code === "authentication_failed"
        ? "Railway needs to be connected again."
        : code === "permission_denied"
          ? "Railway deployment data cannot be read with the current access."
          : code === "invalid_association"
            ? "The Railway service association is no longer valid."
            : code === "normalization_failed"
              ? "Railway returned deployment data ProjectDeck could not interpret."
              : "Railway deployment data could not be read.",
    evidence: {
      operationName: error.operationName,
      providerStatus: error.status,
      providerCodes: error.graphqlErrors.map(({ code: providerCode }) => providerCode).filter(Boolean),
      stage: error.stage,
    },
  };
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
    cache = serviceHealthCache,
    cacheEnabled = fetchDeploymentState === fetchRailwayDeploymentState,
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
      if (!hasAssociationIdentity(metadata)) {
        return {
          projectId,
          observation: providerErrorObservation(
            association,
            "The Railway service association is incomplete.",
            "invalid_association",
          ),
        };
      }
      if (!connectionContainsAssociation(activeConnection, metadata)) {
        return {
          projectId,
          observation: providerErrorObservation(
            association,
            "The Railway service association is no longer present in discovery.",
            "invalid_association",
          ),
        };
      }
      const cacheKey = `${activeConnection.id}:${association.externalId}`;
      const cached = cache.get(cacheKey);
      if (
        cacheEnabled &&
        cached &&
        cached.expiresAt > now()
      ) {
        return { projectId, observation: healthObservation({ monitor, ...cached.result }) };
      }
      const deploymentState = await fetchDeploymentState(
        { projectId: metadata.projectId, environmentId: metadata.environmentId, serviceId: metadata.serviceId },
        { token, fetchImpl },
      );
      const result = deploymentState.partialError
        ? {
            status: "unknown",
            reason: "Railway returned incomplete deployment data for this service.",
            error: { code: "provider_partial" },
            evidence: {
              code: "provider_partial",
              latestDeploymentStatus:
                deploymentState.deployments?.[0]?.status ?? null,
              partialError: deploymentState.partialError,
              attentionSignal: "provider_unavailable",
            },
          }
        : railwayServiceDeploymentHealth(
            deploymentState.deployments,
            deploymentState.activeDeployment,
          );
      if (cacheEnabled) {
        cache.set(cacheKey, {
          result,
          expiresAt: now() + RAILWAY_HEALTH_TTL_MS,
        });
      }
      return { projectId, observation: healthObservation({ monitor, ...result }) };
    } catch (error) {
      const failure = observationFailure(error);
      const observation = providerErrorObservation(
        association,
        failure.message,
        failure.code,
      );
      observation.evidence = {
        ...observation.evidence,
        ...failure.evidence,
      };
      return { projectId, observation };
    }
  });
}
