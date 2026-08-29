export const HEALTH_STATUSES = [
  "healthy",
  "degraded",
  "down",
  "unknown",
  "not_monitored",
];

export const HEALTH_LABELS = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
  unknown: "Unknown",
  not_monitored: "Not monitored",
};

export function healthObservation({
  monitor,
  status,
  reason,
  observedAt = null,
  evidence = null,
  error = null,
}) {
  if (!HEALTH_STATUSES.includes(status)) {
    throw new Error(`Unsupported health status: ${status}`);
  }

  return {
    status,
    label: HEALTH_LABELS[status],
    source: monitor.monitorType,
    provider: monitor.resource?.provider ?? providerForType(monitor.monitorType),
    monitor: {
      id: monitor.id,
      label: monitor.label,
      monitorType: monitor.monitorType,
      enabled: Boolean(monitor.enabled),
      affectsProjectHealth: Boolean(monitor.affectsProjectHealth),
    },
    resource: monitor.resource
      ? {
          id: monitor.resource.id,
          label: monitor.resource.label,
          url: monitor.resource.url,
          provider: monitor.resource.provider,
          externalId: monitor.resource.externalId,
        }
      : null,
    component: monitor.component
      ? { id: monitor.component.id, name: monitor.component.name }
      : null,
    reason,
    observedAt,
    evidence,
    error,
  };
}

export function providerForType(type) {
  return {
    railway_deployment: "railway",
    vercel_deployment: "vercel",
    postgres: "postgresql",
    http: "http",
  }[type] ?? "unknown";
}

export function aggregateProjectHealth(observations = []) {
  const affecting = observations.filter(
    (observation) =>
      observation.monitor.enabled && observation.monitor.affectsProjectHealth,
  );

  if (affecting.length === 0) {
    return {
      status: "not_monitored",
      label: HEALTH_LABELS.not_monitored,
      reason: "No enabled monitors affect Project Health.",
      monitorCount: observations.filter(({ monitor }) => monitor.enabled).length,
      affectingMonitorCount: 0,
      observations,
    };
  }

  const statuses = affecting.map(({ status }) => status);
  let status;
  let reason;

  if (statuses.includes("down")) {
    status = "down";
    const count = statuses.filter((value) => value === "down").length;
    reason = `${count} required ${count === 1 ? "resource is" : "resources are"} down.`;
  } else if (statuses.every((value) => value === "healthy")) {
    status = "healthy";
    reason = `All ${affecting.length} health-affecting ${affecting.length === 1 ? "resource is" : "resources are"} healthy.`;
  } else if (statuses.every((value) => value === "unknown")) {
    status = "unknown";
    reason = "Monitoring is configured, but operational state could not be established.";
  } else {
    status = "degraded";
    reason = "Monitored resources report mixed, transitional, or incomplete operational state.";
  }

  return {
    status,
    label: HEALTH_LABELS[status],
    reason,
    monitorCount: observations.filter(({ monitor }) => monitor.enabled).length,
    affectingMonitorCount: affecting.length,
    observations,
  };
}

