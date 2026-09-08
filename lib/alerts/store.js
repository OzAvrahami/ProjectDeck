import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { components, healthAlertStates, healthIncidents, notificationDeliveries, notificationSettings, projects, providerResourceAssociations, resourceMonitors, resources } from "../../db/schema.js";
import { alertBaseUrl, DEFAULT_NOTIFICATION_SETTINGS } from "./config.js";
import { healthAlertSummary, notificationContent } from "./content.js";
import { deliveryPayload, notificationConfiguration } from "./providers.js";
import { CLAIM_TIMEOUT_MS, EMAIL_RETRY_WINDOW_MS, evaluateHealthTransition, MAX_DELIVERY_ATTEMPTS, RETRY_DELAY_MS } from "./policy.js";

const PENDING = ["pending", "retry", "unconfigured"];
const ORIGIN = "__PROJECTDECK_ORIGIN__";

export async function readNotificationSettings(db) {
  return (await db.select().from(notificationSettings).where(eq(notificationSettings.id, 1)))[0] ?? { ...DEFAULT_NOTIFICATION_SETTINGS, id: 1 };
}

export async function saveNotificationSettings(db, values) {
  await db.insert(notificationSettings).values({ id: 1, ...values }).onConflictDoUpdate({
    target: notificationSettings.id, set: { ...values, updatedAt: new Date() },
  });
}

// Local Health inputs only. No Issues, Releases, commits or workflow fetches.
export async function listAlertProjects(db) {
  const [rows, monitors, associations, componentRows, resourceRows] = await Promise.all([
    db.select().from(projects), db.select().from(resourceMonitors),
    db.select().from(providerResourceAssociations), db.select().from(components), db.select().from(resources),
  ]);
  const componentMap = new Map(componentRows.map((row) => [row.id, row]));
  const resourceMap = new Map(resourceRows.map((row) => [row.id, row]));
  return rows.map((project) => ({ ...project,
    healthMonitors: monitors.filter((row) => row.projectId === project.id && row.enabled && row.affectsProjectHealth)
      .map((row) => ({ ...row, resource: resourceMap.get(row.resourceId), component: componentMap.get(row.componentId ?? resourceMap.get(row.resourceId)?.componentId) })),
    providerAssociations: associations.filter((row) => row.projectId === project.id && row.enabled && row.affectsProjectHealth)
      .map((row) => ({ ...row, component: componentMap.get(row.componentId) })),
  }));
}

async function cancelObsolete(tx, incidentId, reason) {
  await tx.update(notificationDeliveries).set({ status: "cancelled", failureClassification: reason })
    .where(and(eq(notificationDeliveries.incidentId, incidentId), inArray(notificationDeliveries.status, PENDING)));
}

export async function persistHealthObservation(db, project, observedAt) {
  return db.transaction(async (tx) => {
    // Lock a row that exists even before the first observation/incident. All
    // writers for this Project serialize here; the partial unique index backs it.
    const [currentProject] = await tx.select().from(projects).where(eq(projects.id, project.id)).for("update");
    if (!currentProject) return { ignored: true };
    const settings = await readNotificationSettings(tx);
    const [state] = await tx.select().from(healthAlertStates).where(eq(healthAlertStates.projectId, project.id));
    let [incident] = await tx.select().from(healthIncidents).where(and(eq(healthIncidents.projectId, project.id), isNull(healthIncidents.closedAt)));
    const enabled = settings.alertsEnabled && currentProject.healthAlertsEnabled;
    const decision = evaluateHealthTransition({ state, incident, status: project.health.status, observedAt, enabled });
    if (decision.ignored) return decision;
    await tx.insert(healthAlertStates).values({ projectId: project.id, ...decision.state })
      .onConflictDoUpdate({ target: healthAlertStates.projectId, set: decision.state });
    const previousStatus = incident?.currentStatus ?? state?.status ?? "unknown";
    let summary = healthAlertSummary(project.health);
    if (decision.event === "incident_recovered") summary = { ...summary, components: incident.summary.components, sources: incident.summary.sources };
    if (decision.closeReason) {
      await tx.update(healthIncidents).set({ closedAt: observedAt, closureReason: decision.closeReason, lastObservedAt: observedAt, currentStatus: project.health.status })
        .where(eq(healthIncidents.id, incident.id));
      await cancelObsolete(tx, incident.id, decision.closeReason);
      return { closed: true };
    }
    if (decision.event === "incident_opened") {
      [incident] = await tx.insert(healthIncidents).values({ projectId: project.id, openedAt: decision.state.statusSince,
        lastObservedAt: observedAt, initialStatus: project.health.status, currentStatus: project.health.status, summary }).returning();
    } else if (incident) {
      const change = { lastObservedAt: observedAt, currentStatus: project.health.status, summary };
      if (decision.event === "incident_escalated") change.escalatedAt = observedAt;
      if (decision.event === "incident_recovered") Object.assign(change, { recoveredAt: observedAt, closedAt: observedAt, closureReason: "recovered" });
      [incident] = await tx.update(healthIncidents).set(change).where(eq(healthIncidents.id, incident.id)).returning();
      if (decision.event) await cancelObsolete(tx, incident.id, "superseded");
    }
    if (decision.event) {
      const content = notificationContent({ project: currentProject, incident, notificationType: decision.event, previousStatus,
        observedAt, summary, baseUrl: ORIGIN });
      for (const channel of ["email", "sms"]) {
        const recipient = channel === "email" ? settings.emailRecipient : settings.phoneNumber;
        if (!(channel === "email" ? settings.emailEnabled : settings.smsEnabled) || !recipient) continue;
        await tx.insert(notificationDeliveries).values({ incidentId: incident.id, channel, notificationType: decision.event,
          payload: { recipient, content }, createdAt: observedAt }).onConflictDoNothing();
      }
    }
    return { event: decision.event };
  });
}

export async function pendingDeliveryIds(db, now, { testId = null } = {}) {
  const eligible = or(inArray(notificationDeliveries.status, PENDING), and(eq(notificationDeliveries.status, "sending"), lte(notificationDeliveries.attemptedAt, new Date(now - CLAIM_TIMEOUT_MS))));
  // Reserve capacity independently so a backlog of unconfigured Email cannot
  // starve SMS (or vice versa). Future retries cannot occupy the ready window.
  const batches = await Promise.all(["email", "sms"].map((channel) =>
    db.select({ id: notificationDeliveries.id, channel: notificationDeliveries.channel }).from(notificationDeliveries)
      .where(and(eligible, eq(notificationDeliveries.channel, channel),
        or(isNull(notificationDeliveries.nextAttemptAt), lte(notificationDeliveries.nextAttemptAt, now)),
        testId ? eq(notificationDeliveries.id, testId) : isNull(notificationDeliveries.testKey)))
      .orderBy(asc(notificationDeliveries.createdAt)).limit(50),
  ));
  return batches.flat();
}

export async function claimDelivery(db, id, now, env) {
  return db.transaction(async (tx) => {
    const [delivery] = await tx.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, id)).for("update", { skipLocked: true });
    if (!delivery || ![...PENDING, "sending"].includes(delivery.status)) return null;
    if (delivery.nextAttemptAt && delivery.nextAttemptAt > now) return null;
    if (delivery.status === "sending" && now - delivery.attemptedAt < CLAIM_TIMEOUT_MS) return null;
    const stop = async (status, failureClassification) => {
      await tx.update(notificationDeliveries).set({ status, failureClassification }).where(eq(notificationDeliveries.id, id));
      return null;
    };
    if (delivery.status === "sending" && delivery.channel === "sms") return stop("uncertain", "provider_acceptance_unknown");
    if (delivery.firstAttemptedAt && now - delivery.firstAttemptedAt >= EMAIL_RETRY_WINDOW_MS) return stop("uncertain", "retry_window_expired");
    if (delivery.attempts >= MAX_DELIVERY_ATTEMPTS) return stop(delivery.status === "sending" ? "uncertain" : "failed", "attempts_exhausted");
    const settings = await readNotificationSettings(tx);
    const recipient = delivery.channel === "email" ? settings.emailRecipient : settings.phoneNumber;
    const originalRecipient = delivery.firstAttemptedAt ? delivery.payload.to : delivery.payload.recipient;
    if (recipient !== originalRecipient) return stop("cancelled", "recipient_changed");
    if (delivery.notificationType !== "test") {
      const [context] = await tx.select({ project: projects, incident: healthIncidents }).from(healthIncidents)
        .innerJoin(projects, eq(projects.id, healthIncidents.projectId)).where(eq(healthIncidents.id, delivery.incidentId));
      if (!context || !settings.alertsEnabled || !context.project.healthAlertsEnabled || !(delivery.channel === "email" ? settings.emailEnabled : settings.smsEnabled)) {
        return stop("cancelled", "alerts_disabled");
      }
      if ((context.incident.closedAt && delivery.notificationType !== "incident_recovered") ||
        (context.incident.escalatedAt && delivery.notificationType === "incident_opened")) return stop("cancelled", "superseded");
    }
    const config = notificationConfiguration(env);
    if (!config.baseUrlConfigured) return stop("unconfigured", "base_url_unconfigured");
    if (!(delivery.channel === "email" ? config.emailConfigured : config.smsConfigured)) return stop("unconfigured", "provider_unconfigured");
    let payload = delivery.payload;
    if (!delivery.firstAttemptedAt) {
      const content = Object.fromEntries(Object.entries(payload.content).map(([key, value]) => [key, value.replaceAll(ORIGIN, alertBaseUrl(env))]));
      payload = deliveryPayload(delivery.channel, recipient, content, env);
    }
    const [claimed] = await tx.update(notificationDeliveries).set({ status: "sending", attempts: delivery.attempts + 1,
      attemptedAt: now, firstAttemptedAt: delivery.firstAttemptedAt ?? now, nextAttemptAt: null, failureClassification: null, payload })
      .where(eq(notificationDeliveries.id, id)).returning();
    return claimed;
  });
}

export async function finishDelivery(db, delivery, result, now) {
  const retry = result.status === "retry";
  const exhausted = retry && delivery.attempts >= MAX_DELIVERY_ATTEMPTS;
  const status = exhausted
    ? result.failureClassification === "provider_acceptance_unknown" ? "uncertain" : "failed"
    : result.status;
  await db.update(notificationDeliveries).set({ status, failureClassification: result.failureClassification ?? null,
    providerMessageId: result.providerMessageId ?? null, sentAt: status === "sent" ? now : null,
    nextAttemptAt: status === "retry" ? new Date(now.getTime() + RETRY_DELAY_MS) : null })
    .where(and(eq(notificationDeliveries.id, delivery.id), eq(notificationDeliveries.status, "sending"), eq(notificationDeliveries.attempts, delivery.attempts)));
}

export async function createTestDelivery(db, channel, testKey, now = new Date()) {
  if (!["email", "sms"].includes(channel) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(testKey)) throw new Error("Invalid test request.");
  return db.transaction(async (tx) => {
    await tx.insert(notificationSettings).values({ id: 1 }).onConflictDoNothing();
    const [settings] = await tx.select().from(notificationSettings).where(eq(notificationSettings.id, 1)).for("update");
    const [existing] = await tx.select({ id: notificationDeliveries.id }).from(notificationDeliveries).where(eq(notificationDeliveries.testKey, testKey));
    if (existing) return existing.id;
    const [recent] = await tx.select({ createdAt: notificationDeliveries.createdAt }).from(notificationDeliveries)
      .where(and(eq(notificationDeliveries.notificationType, "test"), eq(notificationDeliveries.channel, channel)))
      .orderBy(desc(notificationDeliveries.createdAt)).limit(1);
    if (recent && now - recent.createdAt < 60_000) throw new Error("Wait one minute before another test on this channel.");
    const recipient = channel === "email" ? settings.emailRecipient : settings.phoneNumber;
    if (!recipient) throw new Error("Save a recipient before testing.");
    const id = randomUUID();
    const message = `ProjectDeck TEST: This is a deliberate test notification. No Health incident was created.\nOpen: ${ORIGIN}/settings/notifications`;
    await tx.insert(notificationDeliveries).values({ id, channel, testKey, notificationType: "test", createdAt: now,
      payload: { recipient, content: { subject: "[ProjectDeck] TEST notification", text: message, sms: message } } });
    return id;
  });
}

export async function readAlertHistory(db) {
  const incidents = await db.select({ id: healthIncidents.id, projectName: projects.name, slug: projects.slug,
    state: healthIncidents.currentStatus, openedAt: healthIncidents.openedAt, recoveredAt: healthIncidents.recoveredAt,
    closedAt: healthIncidents.closedAt, closureReason: healthIncidents.closureReason }).from(healthIncidents)
    .innerJoin(projects, eq(projects.id, healthIncidents.projectId)).orderBy(desc(healthIncidents.openedAt)).limit(25);
  const columns = { id: notificationDeliveries.id, incidentId: notificationDeliveries.incidentId, channel: notificationDeliveries.channel,
    notificationType: notificationDeliveries.notificationType, status: notificationDeliveries.status, attempts: notificationDeliveries.attempts,
    createdAt: notificationDeliveries.createdAt, sentAt: notificationDeliveries.sentAt, failureClassification: notificationDeliveries.failureClassification };
  const [deliveries, tests] = await Promise.all([
    incidents.length ? db.select(columns).from(notificationDeliveries).where(inArray(notificationDeliveries.incidentId, incidents.map(({ id }) => id))) : [],
    db.select(columns).from(notificationDeliveries).where(eq(notificationDeliveries.notificationType, "test")).orderBy(desc(notificationDeliveries.createdAt)).limit(10),
  ]);
  return { incidents: incidents.map((incident) => ({ ...incident, deliveries: deliveries.filter(({ incidentId }) => incidentId === incident.id) })), tests };
}
