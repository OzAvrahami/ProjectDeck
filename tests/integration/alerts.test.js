import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
vi.mock("server-only", () => ({}));
import { openAlertDatabase } from "../../lib/alerts/database.js";
import { healthAlertStates, healthIncidents, notificationDeliveries, notificationSettings, projects, resourceMonitors } from "../../db/schema.js";
import { claimDelivery, createTestDelivery, persistHealthObservation, readAlertHistory, readNotificationSettings, saveNotificationSettings } from "../../lib/alerts/store.js";
import { checkAllProjectAlerts, deliverPendingNotifications } from "../../lib/alerts/worker.js";
import { aggregateProjectHealth, healthObservation } from "../../lib/health/model.js";

const url = process.env.TEST_ALERT_DATABASE_URL;
// This suite migrates and clears an explicitly isolated LOCAL test database.
// Refuse production even if the operator supplies the wrong URL.
if (url) {
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.pathname !== "/projectdeck_alert_test") throw new Error("Use a localhost database named projectdeck_alert_test.");
}
const env = { PROJECTDECK_BASE_URL: "https://deck.example", RESEND_API_KEY: "fake-resend",
  PROJECTDECK_ALERT_EMAIL_FROM: "alerts@example.com", TWILIO_ACCOUNT_SID: `AC${"1".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "fake-twilio", TWILIO_FROM_NUMBER: "+15005550006" };
const start = new Date("2026-09-08T12:00:00Z");
const at = (minutes) => new Date(start.getTime() + minutes * 60_000);
const options = { alertsEnabled: true, emailEnabled: true, emailRecipient: "owner@example.com", smsEnabled: true, phoneNumber: "+15005550009" };
function health(status) {
  return aggregateProjectHealth(status === "not_monitored" ? [] : [healthObservation({
    monitor: { id: "monitor", monitorType: "http", enabled: true, affectsProjectHealth: true, component: { id: "api", name: "API" } }, status, reason: "test evidence",
  })]);
}
const accepted = async (delivery) => ({ status: "sent", providerMessageId: `mock-${delivery.id}` });

describe.skipIf(!url)("durable Health alerts on PostgreSQL", () => {
  let connection, db, project;
  beforeAll(async () => {
    connection = openAlertDatabase(url); db = connection.db;
    await migrate(db, { migrationsFolder: "./db/migrations" });
  });
  afterAll(async () => { await connection?.close(); });
  beforeEach(async () => {
    await db.delete(notificationDeliveries);
    await db.delete(projects);
    await db.delete(notificationSettings);
    await saveNotificationSettings(db, options);
    [project] = await db.insert(projects).values({ slug: "test-project", name: "Test Project", tagline: "Fixture", accent: "260", healthAlertsEnabled: true }).returning();
  });
  const observe = (status, minute = 0) => persistHealthObservation(db, { ...project, health: health(status) }, at(minute));
  const deliver = (minute, send = accepted, extra = {}) => deliverPendingNotifications({ db, env, send, now: () => at(minute), ...extra });

  it("serializes concurrent incident creation and only sends each event/channel once", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => observe("down")));
    expect(results.filter(({ event }) => event === "incident_opened")).toHaveLength(1);
    expect(await db.select().from(healthIncidents)).toHaveLength(1);
    expect(await db.select().from(notificationDeliveries)).toHaveLength(2);
    const send = vi.fn(accepted);
    await Promise.all([deliver(0, send), deliver(0, send), deliver(0, send)]);
    await observe("down", 5);
    await deliver(5, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(new Set(send.mock.calls.map(([d]) => d.channel)).size).toBe(2);
    expect((await readAlertHistory(db)).incidents[0].deliveries.every((d) => d.status === "sent")).toBe(true);
  });

  it("confirms Degraded, permits one Down escalation and one recovery", async () => {
    await observe("healthy");
    await observe("degraded", 1);
    await observe("degraded", 2);
    expect(await db.select().from(healthIncidents)).toHaveLength(0);
    await observe("degraded", 6);
    const send = vi.fn(accepted);
    await deliver(6, send);
    await observe("down", 7); await deliver(7, send);
    await observe("degraded", 8); await observe("down", 9); await deliver(9, send);
    await observe("healthy", 20); await deliver(20, send);
    await observe("healthy", 25); await deliver(25, send);
    expect(send).toHaveBeenCalledTimes(6);
    const [stored] = await db.select().from(healthIncidents);
    expect(stored).toMatchObject({ initialStatus: "degraded", currentStatus: "healthy", recoveredAt: at(20), closedAt: at(20) });
    expect(stored.openedAt).toEqual(at(1));
    const recovered = send.mock.calls.map(([d]) => d).find((d) => d.channel === "email" && d.notificationType === "incident_recovered");
    expect(recovered.payload.text).toContain("Duration: 19 minutes");
    expect(recovered.payload.text).toContain("Affected Components: API");
  });

  it("retries only failed Email on later runs without duplicating successful SMS", async () => {
    await observe("down");
    const send = vi.fn(async (d) => d.channel === "email" ? { status: "retry", failureClassification: "rate_limited" } : accepted(d));
    await deliver(0, send); await deliver(0, send); await deliver(4, send);
    expect(send).toHaveBeenCalledTimes(2);
    await deliver(5, send); await deliver(10, send); await deliver(15, send);
    expect(send.mock.calls.filter(([d]) => d.channel === "email")).toHaveLength(3);
    expect(send.mock.calls.filter(([d]) => d.channel === "sms")).toHaveLength(1);
    const rows = await db.select().from(notificationDeliveries);
    expect(rows.find((d) => d.channel === "email")).toMatchObject({ status: "failed", attempts: 3 });
    expect(rows.find((d) => d.channel === "sms")).toMatchObject({ status: "sent", attempts: 1 });
  });

  it("retains uncertain Email acceptance after exhausting safe retries", async () => {
    await observe("down");
    const send = vi.fn(async (d) => d.channel === "email" ? { status: "retry", failureClassification: "provider_acceptance_unknown" } : accepted(d));
    await deliver(0, send); await deliver(5, send); await deliver(10, send); await deliver(15, send);
    const rows = await db.select().from(notificationDeliveries);
    expect(rows.find((d) => d.channel === "email")).toMatchObject({ status: "uncertain", attempts: 3, sentAt: null });
    expect(send.mock.calls.filter(([d]) => d.channel === "email")).toHaveLength(3);
  });

  it("also retries only failed SMS and does not repeat Email", async () => {
    await observe("down");
    const send = vi.fn(async (d) => d.channel === "sms" ? { status: "retry", failureClassification: "rate_limited" } : accepted(d));
    await deliver(0, send); await deliver(5, send);
    expect(send.mock.calls.filter(([d]) => d.channel === "email")).toHaveLength(1);
    expect(send.mock.calls.filter(([d]) => d.channel === "sms")).toHaveLength(2);
  });

  it("preserves immutable request/idempotency after a crashed Email attempt; never reclaims uncertain SMS", async () => {
    await observe("down");
    const rows = await db.select().from(notificationDeliveries);
    const email = rows.find((d) => d.channel === "email");
    const sms = rows.find((d) => d.channel === "sms");
    const first = await claimDelivery(db, email.id, at(0), env);
    await claimDelivery(db, sms.id, at(0), env);
    expect(await claimDelivery(db, email.id, at(1), env)).toBeNull();
    const retry = await claimDelivery(db, email.id, at(5), { ...env, PROJECTDECK_BASE_URL: "https://new.example", PROJECTDECK_ALERT_EMAIL_FROM: "changed@example.com" });
    expect(retry.id).toBe(first.id);
    expect(retry.payload).toEqual(first.payload);
    expect(retry.attempts).toBe(2);
    expect(await claimDelivery(db, sms.id, at(5), env)).toBeNull();
    const [stored] = await db.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, sms.id));
    expect(stored.status).toBe("uncertain");
    expect(await claimDelivery(db, email.id, at(24 * 60), env)).toBeNull();
    const [expired] = await db.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, email.id));
    expect(expired.failureClassification).toBe("retry_window_expired");
  });

  it("recovers without sending obsolete pending Down messages", async () => {
    await observe("down"); await observe("healthy", 5);
    const send = vi.fn(accepted);
    await deliver(5, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.every(([d]) => d.notificationType === "incident_recovered")).toBe(true);
    expect((await db.select().from(notificationDeliveries)).filter((d) => d.status === "cancelled")).toHaveLength(2);
  });

  it("keeps missing configuration separate and binds a valid absolute URL before sending", async () => {
    await observe("down");
    const send = vi.fn(accepted);
    await deliver(0, send, { env: {} });
    expect(send).not.toHaveBeenCalled();
    expect((await db.select().from(notificationDeliveries)).every((d) => d.status === "unconfigured" && d.attempts === 0)).toBe(true);
    await deliver(5, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0].payload).not.toHaveProperty("content");
    expect(JSON.stringify(send.mock.calls)).toContain("https://deck.example/projects/test-project");
  });

  it("cancels queued delivery when recipient changes or Project opts out", async () => {
    await observe("down");
    await saveNotificationSettings(db, { ...options, emailRecipient: "new@example.com" });
    await db.update(projects).set({ healthAlertsEnabled: false }).where(eq(projects.id, project.id));
    const send = vi.fn(accepted);
    await deliver(5, send);
    expect(send).not.toHaveBeenCalled();
    await observe("down", 5);
    expect((await db.select().from(healthIncidents))[0].closureReason).toBe("alerts_disabled");
  });

  it("does not manufacture a recovery when monitoring is removed", async () => {
    await observe("down"); await observe("not_monitored", 5);
    const send = vi.fn(accepted); await deliver(5, send);
    expect(send).not.toHaveBeenCalled();
    const [row] = await db.select().from(healthIncidents);
    expect(row.closureReason).toBe("not_monitored");
    expect(row.recoveredAt).toBeNull();
    await observe("not_monitored", 10);
    expect(await db.select().from(healthIncidents)).toHaveLength(1);
  });

  it("confirms Unknown deterministically and excludes unrelated development metadata", async () => {
    const unrelated = { ...project, needsAttention: true, issues: [{ state: "open" }], phase: "backlog", releases: [] };
    await persistHealthObservation(db, { ...unrelated, health: health("healthy") }, at(0));
    await persistHealthObservation(db, { ...unrelated, health: health("not_monitored") }, at(1));
    expect(await db.select().from(healthIncidents)).toHaveLength(0);
    await observe("unknown", 2); await observe("unknown", 7);
    expect(await db.select().from(healthIncidents)).toHaveLength(0);
    await observe("unknown", 12);
    const send = vi.fn(accepted); await deliver(12, send);
    expect(JSON.stringify(send.mock.calls)).toContain("Health unknown");
    expect(JSON.stringify(send.mock.calls)).not.toContain("is DOWN");
  });

  it.each(["email", "sms"])("records explicit %s tests separately, deduplicates replays and rate limits new tests", async (channel) => {
    await saveNotificationSettings(db, { ...options, alertsEnabled: false });
    const key = randomUUID();
    const [a, b] = await Promise.all([createTestDelivery(db, channel, key, at(0)), createTestDelivery(db, channel, key, at(0))]);
    expect(a).toBe(b);
    const send = vi.fn(accepted);
    await deliver(0, send); expect(send).not.toHaveBeenCalled();
    await deliver(0, send, { testId: a }); await deliver(0, send, { testId: b });
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(send.mock.calls[0][0].payload)).toContain("TEST");
    expect(await db.select().from(healthIncidents)).toHaveLength(0);
    await expect(createTestDelivery(db, channel, randomUUID(), at(0))).rejects.toThrow("Wait one minute");
    expect((await readAlertHistory(db)).tests).toHaveLength(1);
    expect(JSON.stringify(await readAlertHistory(db))).not.toContain("owner@example.com");
  });

  it("runs Health-only evaluation with disabled delivery and a side-effect-free dry run", async () => {
    const send = vi.fn(accepted);
    const observeProjects = vi.fn(async (inputs) => inputs.map((input) => ({ ...input, health: health("down") })));
    await checkAllProjectAlerts({ db, env, observe: observeProjects, send, dryRun: true, now: () => at(0) });
    expect(await db.select().from(healthIncidents)).toHaveLength(0);
    expect(await db.select().from(healthAlertStates)).toHaveLength(0);
    await checkAllProjectAlerts({ db, env, observe: observeProjects, send, deliveryDisabled: true, now: () => at(0) });
    expect(await db.select().from(healthIncidents)).toHaveLength(1);
    expect(send).not.toHaveBeenCalled();
    expect(observeProjects.mock.calls[0][1].railwayConnection.cacheEnabled).toBe(false);
  });

  it("uses real Health aggregation for configured HTTP and Not monitored without GitHub requests", async () => {
    await db.insert(resourceMonitors).values({ projectId: project.id, label: "HTTP", monitorType: "http", configuration: { url: "https://runtime.example/health", method: "GET" } });
    await db.insert(projects).values({ slug: "not-monitored", name: "Not monitored", tagline: "Fixture", accent: "260", healthAlertsEnabled: true });
    const requests = [];
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => { requests.push(String(url)); return new Response(null, { status: 200 }); });
    try {
      const result = await checkAllProjectAlerts({ db, env, deliveryDisabled: true, now: () => at(0) });
      expect(result.health).toMatchObject({ healthy: 1, not_monitored: 1 });
      expect(requests).toEqual(["https://runtime.example/health"]);
      expect(await db.select().from(healthIncidents)).toHaveLength(0);
    } finally { fetch.mockRestore(); }
  });

  it("reserves independent queue capacity for SMS behind an Email backlog", async () => {
    const rows = [];
    for (let index = 0; index < 55; index++) {
      const [p] = await db.insert(projects).values({ slug: `backlog-${index}`, name: "Backlog fixture", tagline: "Fixture", accent: "258", healthAlertsEnabled: true }).returning();
      const [incident] = await db.insert(healthIncidents).values({ projectId: p.id, openedAt: at(0), lastObservedAt: at(0), initialStatus: "down", currentStatus: "down", summary: { reason: "HTTP failed", components: [], sources: ["HTTP check"] } }).returning();
      rows.push({ incidentId: incident.id, channel: "email", notificationType: "incident_opened", createdAt: at(0), payload: { recipient: options.emailRecipient, content: { subject: "Test", text: "Test", sms: "Test" } } });
    }
    await db.insert(notificationDeliveries).values(rows);
    await observe("down", 1);
    const send = vi.fn(accepted);
    await deliver(1, send, { env: { ...env, RESEND_API_KEY: "" } });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].channel).toBe("sms");
  });

  it("enforces database uniqueness even if an application writer bypasses policy", async () => {
    await observe("down");
    const [active] = await db.select().from(healthIncidents);
    await expect(db.insert(healthIncidents).values({ ...active, id: randomUUID() })).rejects.toThrow();
    const [delivery] = await db.select().from(notificationDeliveries);
    await expect(db.insert(notificationDeliveries).values({ ...delivery, id: randomUUID() })).rejects.toThrow();
    expect((await readNotificationSettings(db)).emailRecipient).toBe(options.emailRecipient);
    expect((await db.execute(sql`select count(*)::int as count from health_incidents`))[0].count).toBe(1);
  });
});
