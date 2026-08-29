import "server-only";

import {
  fetchLatestRailwayDeployment,
  parseRailwayResource,
  RailwayProviderError,
} from "../../railway/index.js";
import { healthObservation } from "../model.js";

const HEALTHY = new Set(["success", "active", "completed"]);
const DOWN = new Set(["failed", "crashed"]);
const DEGRADED = new Set([
  "initializing",
  "building",
  "deploying",
  "waiting",
  "queued",
  "sleeping",
  "removing",
]);

function errorCode(error) {
  return {
    missing_token: "token_missing",
    authentication: "authentication_failed",
    permission: "permission_denied",
    rate_limit: "provider_failed",
    invalid_identity: "configuration_missing",
    provider: "provider_failed",
  }[error?.code] ?? "provider_failed";
}

export function railwayStatusHealth(status) {
  const normalized = String(status ?? "").toLowerCase();

  if (HEALTHY.has(normalized)) return "healthy";
  if (DOWN.has(normalized)) return "down";
  if (DEGRADED.has(normalized)) return "degraded";
  return "unknown";
}

export async function observeRailwayHealth(
  monitor,
  { token = process.env.RAILWAY_TOKEN, fetchImpl = fetch } = {},
) {
  const identity = parseRailwayResource(monitor.resource);

  if (!identity) {
    return healthObservation({
      monitor,
      status: "unknown",
      reason: "Railway service identity is incomplete.",
      error: { code: "configuration_missing" },
    });
  }

  try {
    const deployment = await fetchLatestRailwayDeployment(identity, {
      token,
      fetchImpl,
    });

    if (!deployment) {
      return healthObservation({
        monitor,
        status: "unknown",
        reason: "Railway has no deployment state for this service.",
        evidence: { identity },
      });
    }

    const status = railwayStatusHealth(deployment.status);
    return healthObservation({
      monitor,
      status,
      reason:
        status === "healthy"
          ? "Latest Railway deployment is active or succeeded."
          : status === "down"
            ? `Latest Railway deployment is ${deployment.status}.`
            : status === "degraded"
              ? `Railway deployment is ${deployment.status}.`
              : `Railway reported ${deployment.status || "an unknown state"}.`,
      observedAt: deployment.observedStateAt,
      evidence: {
        deploymentId: deployment.id,
        deploymentStatus: deployment.status,
        deploymentUrl: deployment.url,
      },
    });
  } catch (error) {
    const providerError =
      error instanceof RailwayProviderError
        ? error
        : new RailwayProviderError(
            "provider",
            "Railway returned an unexpected provider response.",
          );
    return healthObservation({
      monitor,
      status: "unknown",
      reason: providerError.message,
      error: { code: errorCode(providerError) },
    });
  }
}

