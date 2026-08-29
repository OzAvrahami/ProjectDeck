import "server-only";

import {
  fetchLatestVercelProductionDeployment,
  VercelProviderError,
} from "../../vercel/index.js";
import { healthObservation } from "../model.js";

const DEGRADED = new Set([
  "initializing",
  "analyzing",
  "building",
  "deploying",
  "queued",
]);

export function vercelStatusHealth(status) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "ready") return "healthy";
  if (normalized === "error" || normalized === "canceled") return "down";
  if (DEGRADED.has(normalized)) return "degraded";
  return "unknown";
}

export async function observeVercelHealth(
  monitor,
  { token = process.env.VERCEL_TOKEN, fetchImpl = fetch } = {},
) {
  const projectId = monitor.configuration?.projectId ?? monitor.resource?.externalId;
  const teamId = monitor.configuration?.teamId ?? null;

  if (!projectId) {
    return healthObservation({
      monitor,
      status: "unknown",
      reason: "Vercel Project identity is missing.",
      error: { code: "configuration_missing" },
    });
  }

  try {
    const deployment = await fetchLatestVercelProductionDeployment(
      { projectId, teamId },
      { token, fetchImpl },
    );
    if (!deployment) {
      return healthObservation({
        monitor,
        status: "unknown",
        reason: "Vercel has no production deployment for this Project.",
      });
    }

    const status = vercelStatusHealth(deployment.state);
    return healthObservation({
      monitor,
      status,
      reason:
        status === "healthy"
          ? "Latest Vercel production deployment is ready."
          : status === "down"
            ? `Latest Vercel production deployment is ${deployment.state}.`
            : status === "degraded"
              ? `Vercel production deployment is ${deployment.state}.`
              : `Vercel reported ${deployment.state || "an unknown state"}.`,
      observedAt: deployment.readyAt ?? deployment.createdAt,
      evidence: {
        deploymentId: deployment.id,
        deploymentState: deployment.state,
        deploymentUrl: deployment.url,
      },
    });
  } catch (error) {
    const providerError =
      error instanceof VercelProviderError
        ? error
        : new VercelProviderError(
            "provider",
            "Vercel returned an unexpected provider response.",
          );
    const code = {
      missing_token: "token_missing",
      authentication: "authentication_failed",
      permission: "permission_denied",
      rate_limit: "provider_failed",
      provider: "provider_failed",
    }[providerError.code] ?? "provider_failed";
    return healthObservation({
      monitor,
      status: "unknown",
      reason: providerError.message,
      error: { code },
    });
  }
}

