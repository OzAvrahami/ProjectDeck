import "server-only";

import { healthObservation } from "../model.js";

export const HTTP_HEALTH_TIMEOUT_MS = 5_000;

function safeEndpoint(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

export async function observeHttpHealth(
  monitor,
  { fetchImpl = fetch, timeoutMs = HTTP_HEALTH_TIMEOUT_MS } = {},
) {
  const endpoint = safeEndpoint(monitor.configuration?.url);
  const method = String(monitor.configuration?.method ?? "GET").toUpperCase();

  if (!endpoint || !["GET", "HEAD"].includes(method)) {
    return healthObservation({
      monitor,
      status: "unknown",
      reason: "HTTP health-check configuration is incomplete or invalid.",
      error: { code: "configuration_missing" },
    });
  }

  try {
    const response = await fetchImpl(endpoint, {
      method,
      cache: "no-store",
      credentials: "omit",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "*/*" },
    });
    const observedAt = new Date().toISOString();

    if (response.status >= 200 && response.status < 300) {
      return healthObservation({
        monitor,
        status: "healthy",
        reason: `Health endpoint returned HTTP ${response.status}.`,
        observedAt,
        evidence: { statusCode: response.status, method },
      });
    }

    if (response.status >= 300 && response.status < 400) {
      return healthObservation({
        monitor,
        status: "unknown",
        reason: `Health endpoint returned a redirect (HTTP ${response.status}); configure the final endpoint explicitly.`,
        observedAt,
        evidence: { statusCode: response.status, method },
      });
    }

    return healthObservation({
      monitor,
      status: "down",
      reason: `Health endpoint returned HTTP ${response.status}.`,
      observedAt,
      evidence: { statusCode: response.status, method },
    });
  } catch (error) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    return healthObservation({
      monitor,
      status: "down",
      reason: timeout
        ? "Health endpoint timed out."
        : "Health endpoint could not be reached.",
      observedAt: new Date().toISOString(),
      error: { code: timeout ? "timeout" : "unreachable" },
    });
  }
}

