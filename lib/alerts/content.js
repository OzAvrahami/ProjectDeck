import { HEALTH_LABELS } from "../health/model.js";

// Never forward raw provider reasons, exception text, URLs, configuration or
// arbitrary evidence. Select structured facts and render owned vocabulary.
const SOURCES = { http: "HTTP check", postgres: "PostgreSQL check", railway_connection: "Railway deployment monitor", railway_deployment: "Railway deployment monitor", vercel_deployment: "Vercel deployment monitor" };
export function safeName(value, limit = 160) {
  return String(value ?? "").replace(/(?:https?|postgres(?:ql)?):\/\/\S+/gi, "[redacted URL]")
    .replace(/(?:bearer\s+\S+|(?:token|password|secret|api[_-]?key)\s*[:=]\s*\S+)/gi, "[redacted]")
    .replace(/[\r\n\x00-\x1f\x7f]/g, " ").slice(0, limit);
}

export function healthAlertSummary(health) {
  const affecting = (health.observations ?? []).filter(({ monitor }) => monitor.enabled && monitor.affectsProjectHealth);
  const affected = affecting.filter(({ status }) => status !== "healthy" && status !== "not_monitored");
  const primary = affected.find(({ status }) => status === health.status) ?? affected[0];
  const source = SOURCES[primary?.source] ?? "Configured monitor";
  let reason = health.status === "healthy" ? "All health-affecting monitors report Healthy."
    : health.status === "unknown" ? "Configured monitoring could not establish operational Health."
      : health.status === "down" ? `${source} reports Down.`
        : "Health-affecting monitors report degraded, mixed or incomplete operational state.";
  if (primary?.evidence?.latestDeploymentFailed && health.status === "degraded") {
    reason = "Latest production deployment failed while an earlier deployment remains active.";
  } else if (primary?.source === "http" && health.status === "down") {
    reason = "HTTP production health check failed.";
  }
  return {
    reason,
    components: [...new Set(affected.map(({ component }) => safeName(component?.name)).filter(Boolean))],
    sources: [...new Set(affecting.map(({ source }) => SOURCES[source] ?? "Configured monitor"))],
  };
}

export function notificationContent({ project, incident, notificationType, previousStatus, observedAt, summary, baseUrl }) {
  const name = safeName(project.name);
  const recovered = notificationType === "incident_recovered";
  const status = recovered ? "healthy" : incident.currentStatus;
  const label = status === "unknown" ? "Health unknown" : HEALTH_LABELS[status];
  const duration = `${Math.max(0, Math.floor((observedAt - incident.openedAt) / 60_000))} minutes`;
  const url = `${baseUrl}/projects/${encodeURIComponent(project.slug)}`;
  const subject = `[ProjectDeck] ${name} ${recovered ? "recovered" : status === "unknown" ? "— Health unknown" : `is ${label}`}`;
  const text = [
    `Project: ${name}`, `Health: ${label}`, `Previous Health: ${HEALTH_LABELS[previousStatus] ?? "Unknown"}`,
    `Started: ${incident.openedAt.toISOString()}`, `Observed: ${observedAt.toISOString()}`, `Duration: ${duration}`,
    `Primary reason: ${summary.reason}`, `Affected Components: ${summary.components.join(", ") || "Project-level"}`,
    `Evidence sources: ${summary.sources.join(", ") || "Configured monitoring"}`, `Open ProjectDeck: ${url}`,
  ].join("\n");
  const sms = recovered
    ? `ProjectDeck: ${name} recovered. Health is Healthy again after ${duration}.\nOpen: ${url}`
    : `ProjectDeck: ${name} ${status === "unknown" ? "— Health unknown" : `is ${label.toUpperCase()}`}.\n${summary.reason}\n${summary.components.length ? `Components: ${summary.components.join(", ").slice(0, 100)}\n` : ""}Observed ${observedAt.toISOString()}.\nOpen: ${url}`;
  return { subject, text, sms };
}
