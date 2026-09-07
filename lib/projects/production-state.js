import { aggregateProjectHealth } from "../health/model.js";

const DEPLOYMENT_SOURCES = new Set(["railway_connection", "railway_deployment", "vercel_deployment"]);
const ATTEMPT_LABELS = {
  success: "Succeeded", active: "Succeeded", completed: "Succeeded", ready: "Succeeded",
  failed: "Failed", error: "Failed", crashed: "Crashed", canceled: "Canceled",
  initializing: "Preparing", analyzing: "Preparing", building: "Building",
  deploying: "Deploying", queued: "Queued", waiting: "Waiting",
  sleeping: "Sleeping", removing: "Removing", removed: "Removed", skipped: "Skipped",
};
const PROVIDERS = { railway: "Railway", vercel: "Vercel", http: "HTTP", postgresql: "PostgreSQL" };

export function isDeploymentObservation(observation) {
  return DEPLOYMENT_SOURCES.has(observation.source);
}

export function deploymentAttemptLabel(status) {
  return ATTEMPT_LABELS[String(status ?? "").toLowerCase()] ?? "Unknown";
}

// Only provider facts enter this model. Health status and Release versions are
// deliberately not inputs to deployment selection or attempt wording.
export function presentDeployment(observation, association = null) {
  const evidence = observation.evidence ?? {};
  const code = observation.error?.code ?? evidence.code;
  const managed = observation.source === "railway_connection";
  const environmentName = association?.metadata?.environmentName?.trim();
  const production = observation.source === "vercel_deployment" ||
    (environmentName ? environmentName.toLowerCase() === "production"
      : association?.metadata?.isDeterministicProduction === true);
  const rawStatus = evidence.latestDeploymentStatus ?? evidence.deploymentStatus ?? evidence.deploymentState;
  const base = {
    id: observation.monitor.id,
    provider: PROVIDERS[observation.provider] ?? observation.provider,
    service: association?.metadata?.serviceName ?? observation.monitor.label,
    environment: environmentName || (production ? "Production" : "Environment not verified"),
    servingLabel: production ? "Serving production" : "Active deployment",
    serving: "Unknown",
    servingId: null,
    latest: deploymentAttemptLabel(rawStatus),
    latestId: evidence.latestDeploymentId ?? evidence.deploymentId ?? null,
    rawStatus: rawStatus ?? null,
    observedAt: observation.observedAt,
    state: "observed",
    note: managed ? null : "Serving deployment is not independently observed by this connection.",
  };
  if (!observation.monitor.enabled) {
    return { ...base, state: "disabled", serving: "Unknown", latest: "Unknown", latestId: null, rawStatus: null, note: "Deployment observation is disabled." };
  }
  if (code === "deployment_not_found") {
    return { ...base, state: "not_deployed", serving: "Not deployed", latest: "No attempt found", note: "No deployment was found for this service in the checked environment." };
  }
  if (code === "provider_partial") {
    return { ...base, state: "partial", serving: "Unknown", note: "Deployment information incomplete. The latest attempt was read; the serving deployment could not be verified." };
  }
  if (code === "active_deployment_not_found") {
    return { ...base, serving: "No active deployment observed", note: "A latest attempt does not establish a serving deployment." };
  }
  if (code) {
    return { ...base, state: "unavailable", serving: "Unknown", latest: "Unknown", latestId: null, rawStatus: null, note: "Provider unavailable or deployment access could not be verified." };
  }
  if (managed && evidence.activeDeploymentId) {
    return { ...base, serving: "Active", servingId: evidence.activeDeploymentId };
  }
  if (managed && evidence.latestDeploymentId) {
    return { ...base, serving: "No active deployment observed" };
  }
  return { ...base, state: rawStatus ? "observed" : "unknown" };
}

export function presentHealthBasis(health) {
  const affecting = (health.observations ?? []).filter(({ monitor }) => monitor.enabled && monitor.affectsProjectHealth);
  const sources = [...new Set(affecting.map((observation) => isDeploymentObservation(observation)
    ? `${PROVIDERS[observation.provider] ?? observation.provider} deployment monitor`
    : observation.source === "http" ? "HTTP check"
      : observation.source === "postgres" ? "PostgreSQL check" : "Configured monitor"))];
  return {
    sources,
    note: affecting.length === 0
      ? "No enabled monitors affect this Health result."
      : affecting.every(isDeploymentObservation)
        ? "Provider deployment monitoring only; no HTTP or database runtime check contributes to this result."
        : "Only configured, health-affecting monitors contribute to this result.",
  };
}

export function buildProductionState(project) {
  const observations = project.health?.observations ?? [];
  const repositories = project.githubSummary?.releases?.repositories ?? [];
  const components = new Map((project.components ?? []).map(({ id, name }) => [id, { id, name }]));
  for (const { component } of [...observations, ...repositories]) {
    if (component && !components.has(component.id)) {
      components.set(component.id, { id: component.id, name: component.name });
    }
  }
  const scoped = components.size > 0;
  const definitions = scoped ? [...components.values()] : [{ id: null, name: null }];
  if (scoped && (observations.some(({ component }) => !component) || repositories.some(({ component }) => !component))) {
    definitions.push({ id: null, name: "Project-level resources" });
  }
  const matches = (item, id) => !scoped || (item.component?.id ?? null) === id;
  return {
    scoped,
    health: project.health ?? aggregateProjectHealth([]),
    scopes: definitions.map(({ id, name }) => {
      const scopeObservations = observations.filter((item) => matches(item, id));
      const health = scoped ? aggregateProjectHealth(scopeObservations) : project.health ?? aggregateProjectHealth([]);
      return {
        id: id ?? "project",
        name,
        releases: repositories.filter((item) => matches(item, id)),
        deployments: scopeObservations.filter(isDeploymentObservation).map((observation) => presentDeployment(
          observation, project.providerAssociations?.find(({ id }) => id === observation.monitor.id),
        )),
        health,
        healthBasis: presentHealthBasis(health),
      };
    }),
  };
}
