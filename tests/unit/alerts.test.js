import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { evaluateHealthTransition, DEGRADED_CONFIRMATION_MS, UNKNOWN_CONFIRMATION_MS } from "../../lib/alerts/policy.js";
import { alertBaseUrl, normalizePhone, validateNotificationSettings } from "../../lib/alerts/config.js";
import { deliveryPayload, notificationConfiguration, sendNotification } from "../../lib/alerts/providers.js";
import { healthAlertSummary, notificationContent } from "../../lib/alerts/content.js";
import { aggregateProjectHealth, healthObservation } from "../../lib/health/model.js";

const start = new Date("2026-09-08T12:00:00Z");
const later = (ms) => new Date(start.getTime() + ms);
const state = (status) => ({ status, statusSince: start, lastObservedAt: start, alertingEnabled: true });
const incident = (status) => ({ initialStatus: status, currentStatus: status, openedAt: start });
const evaluate = (status, previous = null, active = null, ms = 1, enabled = true) => evaluateHealthTransition({ status,
  state: previous, incident: active, observedAt: later(ms), enabled });
export const env = { PROJECTDECK_BASE_URL: "https://deck.example", RESEND_API_KEY: "test-email-secret",
  PROJECTDECK_ALERT_EMAIL_FROM: "alerts@example.com", TWILIO_ACCOUNT_SID: `AC${"1".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "test-sms-secret", TWILIO_FROM_NUMBER: "+15005550006" };

function observation(status, componentName, source = "http", evidence = {}) {
  return healthObservation({ monitor: { id: componentName, enabled: true, affectsProjectHealth: true, monitorType: source, component: { id: componentName, name: componentName } },
    status, reason: "postgres://user:SECRET@private/database token=SECRET", evidence, error: { code: "provider_failed", message: "SECRET" } });
}

describe("Health alert transition policy", () => {
  it("keeps Healthy and Not monitored quiet", () => {
    expect(evaluate("healthy", state("healthy")).event).toBeNull();
    expect(evaluate("not_monitored", state("healthy")).event).toBeNull();
  });
  it("requires a later matching Degraded check after the confirmation window", () => {
    expect(evaluate("degraded", state("healthy")).event).toBeNull();
    expect(evaluate("degraded", state("degraded"), null, DEGRADED_CONFIRMATION_MS - 1).event).toBeNull();
    expect(evaluate("degraded", state("degraded"), null, DEGRADED_CONFIRMATION_MS).event).toBe("incident_opened");
  });
  it("opens Down immediately and does not repeat Down", () => {
    expect(evaluate("down", state("healthy")).event).toBe("incident_opened");
    expect(evaluate("down", state("down"), incident("down")).event).toBeNull();
  });
  it("permits one escalation for the entire incident even after oscillation", () => {
    expect(evaluate("down", state("degraded"), incident("degraded")).event).toBe("incident_escalated");
    expect(evaluate("down", state("degraded"), { ...incident("degraded"), escalatedAt: start }).event).toBeNull();
  });
  it("recovers only on Healthy", () => {
    expect(evaluate("healthy", state("down"), incident("down")).event).toBe("incident_recovered");
    expect(evaluate("unknown", state("down"), incident("down")).event).toBeNull();
    expect(evaluate("not_monitored", state("down"), incident("down"))).toMatchObject({ closeReason: "not_monitored", event: null });
  });
  it("requires ten minutes and another observation for Unknown; restarts on changed Health", () => {
    expect(evaluate("unknown", state("healthy")).event).toBeNull();
    expect(evaluate("unknown", state("unknown"), null, UNKNOWN_CONFIRMATION_MS - 1).event).toBeNull();
    expect(evaluate("unknown", state("unknown"), null, UNKNOWN_CONFIRMATION_MS).event).toBe("incident_opened");
    expect(evaluate("unknown", state("degraded"), null, UNKNOWN_CONFIRMATION_MS).event).toBeNull();
  });
  it("ignores duplicate and older observations", () => {
    expect(evaluate("down", state("healthy"), null, 0)).toEqual({ ignored: true });
    expect(evaluate("down", state("healthy"), null, -1)).toEqual({ ignored: true });
  });
  it("honors opt-out and never confirms based on disabled observations", () => {
    expect(evaluate("down", state("healthy"), null, 1, false).event).toBeNull();
    expect(evaluate("down", state("down"), incident("down"), 1, false).closeReason).toBe("alerts_disabled");
    expect(evaluate("degraded", { ...state("degraded"), alertingEnabled: false }, null, DEGRADED_CONFIRMATION_MS).event).toBeNull();
  });
});

describe("configuration and content boundaries", () => {
  it("validates single recipients and normalizes E.164 without guessing country", () => {
    expect(normalizePhone("+972 (50) 123-4567")).toBe("+972501234567");
    expect(normalizePhone("0501234567")).toBeNull();
    expect(normalizePhone("+01234567890")).toBeNull();
    expect(validateNotificationSettings({ emailEnabled: true, emailRecipient: "a@example.com,b@example.com" }).valid).toBe(false);
    expect(validateNotificationSettings({ smsEnabled: true, phoneNumber: "not a phone" }).valid).toBe(false);
    expect(validateNotificationSettings({}).values.alertsEnabled).toBe(false);
  });
  it("requires an authoritative HTTPS origin in production", () => {
    for (const value of ["javascript:alert(1)", "https://u:p@deck.example", "https://deck.example/path", "https://deck.example?token=secret", "http://deck.example", "http://localhost:3000"]) {
      expect(alertBaseUrl({ NODE_ENV: "production", PROJECTDECK_BASE_URL: value })).toBeNull();
    }
    expect(alertBaseUrl({ PROJECTDECK_BASE_URL: "http://localhost:3000" })).toBe("http://localhost:3000");
    expect(alertBaseUrl(env)).toBe("https://deck.example");
  });
  it("serializes only provider capability flags", () => {
    expect(notificationConfiguration({})).toEqual({ baseUrlConfigured: false, emailConfigured: false, smsConfigured: false });
    const flags = JSON.stringify(notificationConfiguration(env));
    for (const value of Object.values(env)) expect(flags).not.toContain(value);
  });
  it("uses the existing multi-component aggregation and allowlists content", () => {
    const health = aggregateProjectHealth([observation("healthy", "Website"), observation("down", "API")]);
    expect(health.status).toBe("down");
    const summary = healthAlertSummary(health);
    expect(summary.components).toEqual(["API"]);
    const content = notificationContent({ project: { name: "Finance", slug: "finance" }, incident: incident("down"),
      notificationType: "incident_opened", previousStatus: "healthy", observedAt: later(60_000), summary, baseUrl: env.PROJECTDECK_BASE_URL });
    expect(content.text).toContain("Affected Components: API");
    expect(content.text).toContain("Previous Health: Healthy");
    expect(content.sms).toContain("https://deck.example/projects/finance");
    expect(JSON.stringify(content)).not.toContain("SECRET");
    expect(JSON.stringify(summary)).not.toContain("postgres://");
  });
  it("keeps failed deployment with active production Degraded and Unknown wording explicit", () => {
    const health = aggregateProjectHealth([observation("degraded", "Backend", "railway_connection", { latestDeploymentFailed: true })]);
    expect(health.status).toBe("degraded");
    expect(healthAlertSummary(health).reason).toContain("earlier deployment remains active");
    const content = notificationContent({ project: { name: "LifeOS", slug: "lifeos" }, incident: incident("unknown"),
      notificationType: "incident_opened", previousStatus: "healthy", observedAt: start, summary: healthAlertSummary(aggregateProjectHealth([observation("unknown", "API")])), baseUrl: env.PROJECTDECK_BASE_URL });
    expect(content.subject).toContain("Health unknown");
    expect(content.sms).not.toContain("DOWN");
  });
  it("includes recovery duration", () => {
    const content = notificationContent({ project: { name: "Finance", slug: "finance" }, incident: incident("down"),
      notificationType: "incident_recovered", previousStatus: "down", observedAt: later(14 * 60_000),
      summary: { reason: "All healthy", components: ["API"], sources: ["HTTP check"] }, baseUrl: env.PROJECTDECK_BASE_URL });
    expect(content.sms).toContain("Healthy again after 14 minutes");
  });
});

describe("mocked delivery providers", () => {
  const delivery = (channel) => ({ id: "delivery-id", channel, payload: deliveryPayload(channel, channel === "email" ? "owner@example.com" : "+15005550009", { subject: "TEST", text: "TEST", sms: "TEST" }, env) });
  it.each(["email", "sms"])("sends %s via server HTTPS and records provider acceptance", async (channel) => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => channel === "email" ? { id: "email-id" } : { sid: "sms-id" } });
    expect(await sendNotification(delivery(channel), { env, fetchImpl })).toMatchObject({ status: "sent" });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toMatch(/^https:/);
    expect(options.redirect).toBe("error");
    expect(options.body).not.toContain("secret");
    if (channel === "email") expect(options.headers["Idempotency-Key"]).toBe("projectdeck/delivery-id");
    else expect(options.body).toContain("Body=TEST");
  });
  it.each(["email", "sms"])("does not call unconfigured %s", async (channel) => {
    const fetchImpl = vi.fn();
    expect((await sendNotification(delivery(channel), { env: {}, fetchImpl })).status).toBe("unconfigured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each(["email", "sms"])("classifies rejected and rate-limited %s requests without leaking bodies", async (channel) => {
    for (const [code, expected] of [[401, "failed"], [400, "failed"], [429, "retry"]]) {
      const result = await sendNotification(delivery(channel), { env, fetchImpl: async () => ({ ok: false, status: code, text: async () => "SECRET recipient" }) });
      expect(result.status).toBe(expected);
      expect(JSON.stringify(result)).not.toContain("SECRET");
    }
  });
  it.each(["email", "sms"])("handles ambiguous %s timeouts and malformed acceptance", async (channel) => {
    const expected = channel === "email" ? "retry" : "uncertain";
    const result = await sendNotification(delivery(channel), { env, fetchImpl: async () => { throw new Error("SECRET"); } });
    expect(result.status).toBe(expected);
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect((await sendNotification(delivery(channel), { env, fetchImpl: async () => ({ ok: false, status: 503 }) })).status).toBe(expected);
    expect((await sendNotification(delivery(channel), { env, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) })).status).toBe(expected);
  });
});
