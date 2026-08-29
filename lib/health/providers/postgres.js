import "server-only";

import postgres from "postgres";

import { healthObservation } from "../model.js";

export const POSTGRES_HEALTH_TIMEOUT_SECONDS = 5;
const ENVIRONMENT_NAME = /^[A-Z][A-Z0-9_]*$/;

function defaultCreateClient(connectionString) {
  return postgres(connectionString, {
    max: 1,
    connect_timeout: POSTGRES_HEALTH_TIMEOUT_SECONDS,
    idle_timeout: 1,
    max_lifetime: 10,
    prepare: false,
  });
}

function classifyPostgresError(error) {
  const code = String(error?.code ?? "").toUpperCase();
  const message = String(error?.message ?? "").toLowerCase();

  if (
    code === "28P01" ||
    code === "28000" ||
    message.includes("password authentication") ||
    message.includes("authentication failed")
  ) {
    return {
      status: "unknown",
      code: "authentication_failed",
      reason: "PostgreSQL rejected the configured credentials.",
    };
  }

  if (
    ["ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ECONNRESET"].includes(code) ||
    message.includes("timeout") ||
    message.includes("timed out")
  ) {
    return {
      status: "down",
      code: code === "ETIMEDOUT" || message.includes("timeout") ? "timeout" : "unreachable",
      reason: "PostgreSQL could not be reached within the health-check window.",
    };
  }

  return {
    status: "unknown",
    code: "provider_failed",
    reason: "PostgreSQL connectivity could not be evaluated.",
  };
}

export async function observePostgresHealth(
  monitor,
  { env = process.env, createClient = defaultCreateClient } = {},
) {
  const connectionEnvVar = monitor.configuration?.connectionEnvVar;

  if (!ENVIRONMENT_NAME.test(connectionEnvVar ?? "")) {
    return healthObservation({
      monitor,
      status: "unknown",
      reason: "PostgreSQL connection environment-variable name is invalid.",
      error: { code: "configuration_missing" },
    });
  }

  const connectionString = env[connectionEnvVar];
  if (!connectionString) {
    return healthObservation({
      monitor,
      status: "unknown",
      reason: `${connectionEnvVar} is not configured on the ProjectDeck server.`,
      error: { code: "configuration_missing" },
    });
  }

  let client;
  try {
    client = createClient(connectionString);
    await client.unsafe("SELECT 1 AS ok");
    return healthObservation({
      monitor,
      status: "healthy",
      reason: "PostgreSQL accepted a read-only connectivity check.",
      observedAt: new Date().toISOString(),
      evidence: { query: "SELECT 1" },
    });
  } catch (error) {
    const classified = classifyPostgresError(error);
    return healthObservation({
      monitor,
      status: classified.status,
      reason: classified.reason,
      observedAt: new Date().toISOString(),
      error: { code: classified.code },
    });
  } finally {
    if (client) {
      try {
        await client.end({ timeout: 1 });
      } catch {
        // The observation already has its result; cleanup failures are scoped.
      }
    }
  }
}

