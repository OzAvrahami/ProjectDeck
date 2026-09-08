import "server-only";
import { observeProjectsHealth } from "../projects/health-observations.js";
import { getAlertDatabase } from "./database.js";
import { sendNotification } from "./providers.js";
import { claimDelivery, finishDelivery, listAlertProjects, pendingDeliveryIds, persistHealthObservation } from "./store.js";

export async function deliverPendingNotifications({ db = getAlertDatabase(), env = process.env, send = sendNotification, now = () => new Date(), testId = null } = {}) {
  const counts = { email: { attempted: 0, succeeded: 0, failed: 0 }, sms: { attempted: 0, succeeded: 0, failed: 0 } };
  const ids = await pendingDeliveryIds(db, now(), { testId });
  // Each delivery gets at most one attempt in this run. A failed channel cannot
  // stop the other; successful deliveries cannot be claimed again.
  await Promise.all(["email", "sms"].map(async (channel) => {
    for (const { id } of ids.filter((candidate) => candidate.channel === channel)) {
      const delivery = await claimDelivery(db, id, now(), env);
      if (!delivery) continue;
      const count = counts[delivery.channel];
      count.attempted++;
      let result;
      try { result = await send(delivery, { env }); }
      catch { result = { status: delivery.channel === "email" ? "retry" : "uncertain", failureClassification: "provider_acceptance_unknown" }; }
      await finishDelivery(db, delivery, result, now());
      count[result.status === "sent" ? "succeeded" : "failed"]++;
    }
  }));
  return counts;
}

export async function checkAllProjectAlerts({ db = getAlertDatabase(), observe = observeProjectsHealth, env = process.env,
  now = () => new Date(), deliveryDisabled = false, dryRun = false, send = sendNotification } = {}) {
  const startedAt = now();
  const inputs = await listAlertProjects(db);
  const projects = await observe(inputs, { env, railwayToken: env.RAILWAY_TOKEN, vercelToken: env.VERCEL_TOKEN,
    railwayConnection: { cacheEnabled: false } });
  const counts = { projectsChecked: projects.length, incidentsOpened: 0, incidentsEscalated: 0, incidentsRecovered: 0,
    health: { healthy: 0, degraded: 0, down: 0, unknown: 0, not_monitored: 0 }, deliveryDisabled: deliveryDisabled || dryRun, dryRun };
  const eventKeys = { incident_opened: "incidentsOpened", incident_escalated: "incidentsEscalated", incident_recovered: "incidentsRecovered" };
  for (const project of projects) {
    counts.health[project.health.status]++;
    if (dryRun) continue;
    const decision = await persistHealthObservation(db, project, startedAt);
    if (decision.event) counts[eventKeys[decision.event]]++;
  }
  counts.deliveries = deliveryDisabled || dryRun ? null : await deliverPendingNotifications({ db, env, send, now });
  return counts;
}
