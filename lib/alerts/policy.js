import { HEALTH_STATUSES } from "../health/model.js";

// Elapsed windows make scheduler retries/overlaps unable to confirm a single
// transient check. A second matching observation is always required.
export const DEGRADED_CONFIRMATION_MS = 5 * 60_000;
export const UNKNOWN_CONFIRMATION_MS = 10 * 60_000;
export const RETRY_DELAY_MS = 5 * 60_000;
export const CLAIM_TIMEOUT_MS = 2 * 60_000;
export const EMAIL_RETRY_WINDOW_MS = 23 * 60 * 60_000;
export const MAX_DELIVERY_ATTEMPTS = 3;

export function evaluateHealthTransition({ state, incident, status, observedAt, enabled }) {
  if (!HEALTH_STATUSES.includes(status)) throw new Error("Invalid normalized Health status.");
  if (state && observedAt <= state.lastObservedAt) return { ignored: true };
  const previous = state?.alertingEnabled === false ? null : state;
  const nextState = {
    alertingEnabled: Boolean(enabled),
    status,
    statusSince: previous?.status === status ? previous.statusSince : observedAt,
    lastObservedAt: observedAt,
  };
  if (!enabled || status === "not_monitored") {
    return { state: { ...nextState, statusSince: observedAt }, event: null,
      closeReason: incident ? enabled ? "not_monitored" : "alerts_disabled" : null };
  }
  if (incident) {
    if (status === "healthy") return { state: nextState, event: "incident_recovered" };
    if (status === "down" && incident.initialStatus !== "down" && !incident.escalatedAt) {
      return { state: nextState, event: "incident_escalated" };
    }
    return { state: nextState, event: null };
  }
  const elapsed = observedAt - nextState.statusSince;
  const confirmed = previous?.status === status && (
    (status === "degraded" && elapsed >= DEGRADED_CONFIRMATION_MS) ||
    (status === "unknown" && elapsed >= UNKNOWN_CONFIRMATION_MS)
  );
  return { state: nextState, event: status === "down" || confirmed ? "incident_opened" : null };
}
