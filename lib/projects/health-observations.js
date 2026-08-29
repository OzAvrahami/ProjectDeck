import "server-only";

import { aggregateProjectHealth, healthObservation } from "../health/model.js";
import { observeHttpHealth } from "../health/providers/http.js";
import { observePostgresHealth } from "../health/providers/postgres.js";
import { observeRailwayHealth } from "../health/providers/railway.js";
import { observeRailwayConnectionHealth } from "../health/providers/railway-connection.js";
import { observeVercelHealth } from "../health/providers/vercel.js";

export const HEALTH_MONITOR_CONCURRENCY = 6;

const OBSERVERS = {
  railway_deployment: observeRailwayHealth,
  vercel_deployment: observeVercelHealth,
  http: observeHttpHealth,
  postgres: observePostgresHealth,
};

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(concurrency, 1), items.length) },
      () => worker(),
    ),
  );
  return results;
}

function disabledObservation(monitor) {
  return healthObservation({
    monitor,
    status: "not_monitored",
    reason: "This monitor is disabled.",
  });
}

async function observeMonitor(monitor, options) {
  if (!monitor.enabled) return disabledObservation(monitor);

  const observer = OBSERVERS[monitor.monitorType];
  if (!observer) {
    return healthObservation({
      monitor,
      status: "unknown",
      reason: "This monitor type is not supported by ProjectDeck.",
      error: { code: "configuration_missing" },
    });
  }

  try {
    if (monitor.monitorType === "railway_deployment") {
      return await observer(monitor, {
        token: options.railwayToken,
        fetchImpl: options.fetchImpl,
      });
    }
    if (monitor.monitorType === "vercel_deployment") {
      return await observer(monitor, {
        token: options.vercelToken,
        fetchImpl: options.fetchImpl,
      });
    }
    if (monitor.monitorType === "http") {
      return await observer(monitor, {
        fetchImpl: options.fetchImpl,
        timeoutMs: options.httpTimeoutMs,
      });
    }
    return await observer(monitor, {
      env: options.env,
      createClient: options.postgresCreateClient,
    });
  } catch {
    return healthObservation({
      monitor,
      status: "unknown",
      reason: "The monitor returned an unexpected provider response.",
      error: { code: "provider_failed" },
    });
  }
}

export async function observeProjectsHealth(
  projects,
  {
    railwayToken = process.env.RAILWAY_TOKEN,
    vercelToken = process.env.VERCEL_TOKEN,
    fetchImpl = fetch,
    env = process.env,
    postgresCreateClient,
    httpTimeoutMs,
    concurrency = HEALTH_MONITOR_CONCURRENCY,
    railwayConnection = {},
  } = {},
) {
  const managedRailwayIdentities = new Set(
    projects.flatMap((project) =>
      (project.providerAssociations ?? []).map(({ metadata }) =>
        [metadata?.projectId, metadata?.environmentId, metadata?.serviceId]
          .filter(Boolean)
          .join(":"),
      ),
    ),
  );
  const entries = projects.flatMap((project) =>
    (project.healthMonitors ?? [])
      .filter((monitor) => {
        if (monitor.monitorType !== "railway_deployment") return true;
        const externalId = monitor.resource?.externalId;
        return !externalId || !managedRailwayIdentities.has(externalId);
      })
      .map((monitor) => ({
        projectId: project.id,
        monitor: {
          ...monitor,
          legacy: monitor.monitorType === "railway_deployment",
        },
      })),
  );
  const [monitorObservations, connectedRailwayObservations] = await Promise.all([
    mapWithConcurrency(
      entries,
      concurrency,
      async ({ projectId, monitor }) => ({
        projectId,
        observation: await observeMonitor(monitor, {
          railwayToken,
          vercelToken,
          fetchImpl,
          env,
          postgresCreateClient,
          httpTimeoutMs,
        }),
      }),
    ),
    observeRailwayConnectionHealth(projects, {
      fetchImpl,
      ...railwayConnection,
    }),
  ]);
  const observations = [...monitorObservations, ...connectedRailwayObservations];
  const observationsByProject = new Map();

  for (const { projectId, observation } of observations) {
    const projectObservations = observationsByProject.get(projectId) ?? [];
    projectObservations.push(observation);
    observationsByProject.set(projectId, projectObservations);
  }

  return projects.map((project) => ({
    ...project,
    health: aggregateProjectHealth(
      observationsByProject.get(project.id) ?? [],
    ),
  }));
}
