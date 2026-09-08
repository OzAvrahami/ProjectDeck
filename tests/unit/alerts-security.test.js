import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../lib/access/server.js", () => ({ requireAccessSession: vi.fn() }));
vi.mock("../../lib/alerts/database.js", () => ({ getAlertDatabase: vi.fn(() => ({})) }));
vi.mock("../../lib/alerts/store.js", () => ({ createTestDelivery: vi.fn(async () => "test-id"), saveNotificationSettings: vi.fn() }));
vi.mock("../../lib/alerts/worker.js", () => ({ deliverPendingNotifications: vi.fn() }));
import { requireAccessSession } from "../../lib/access/server.js";
import { createTestDelivery, saveNotificationSettings } from "../../lib/alerts/store.js";
import { deliverPendingNotifications } from "../../lib/alerts/worker.js";
import { saveNotificationsAction, sendTestNotificationAction } from "../../app/settings/notifications/actions.js";

describe("notification security boundaries", () => {
  beforeEach(() => vi.clearAllMocks());
  it("requires authenticated private access before any settings write or test send", async () => {
    requireAccessSession.mockRejectedValueOnce(new Error("Denied"));
    await expect(saveNotificationsAction({}, new FormData())).rejects.toThrow("Denied");
    requireAccessSession.mockRejectedValueOnce(new Error("Denied"));
    await expect(sendTestNotificationAction({}, new FormData())).rejects.toThrow("Denied");
    expect(saveNotificationSettings).not.toHaveBeenCalled();
    expect(createTestDelivery).not.toHaveBeenCalled();
    expect(deliverPendingNotifications).not.toHaveBeenCalled();
  });
  it("allowlists recipient settings, excluding submitted credentials", async () => {
    requireAccessSession.mockResolvedValue(undefined);
    const form = new FormData();
    form.set("emailRecipient", "owner@example.com");
    form.set("RESEND_API_KEY", "must-not-persist");
    form.set("TWILIO_AUTH_TOKEN", "must-not-persist");
    expect((await saveNotificationsAction({}, form)).status).toBe("saved");
    expect(JSON.stringify(saveNotificationSettings.mock.calls)).not.toContain("must-not-persist");
    expect(deliverPendingNotifications).not.toHaveBeenCalled();
  });
  it("does not save invalid recipients", async () => {
    const form = new FormData(); form.set("smsEnabled", "on"); form.set("phoneNumber", "5551234");
    expect((await saveNotificationsAction({}, form)).status).toBe("error");
    expect(saveNotificationSettings).not.toHaveBeenCalled();
  });
  it("uses the explicitly recorded test ID for an authenticated click", async () => {
    requireAccessSession.mockResolvedValue(undefined);
    const form = new FormData(); form.set("channel", "sms"); form.set("testKey", "nonce");
    expect((await sendTestNotificationAction({}, form)).status).toBe("complete");
    expect(createTestDelivery).toHaveBeenCalledWith({}, "sms", "nonce");
    expect(deliverPendingNotifications).toHaveBeenCalledWith({ db: {}, testId: "test-id" });
  });
  it("keeps worker/provider modules server-only and exposes no scheduler HTTP route", () => {
    for (const file of ["providers", "database", "store", "worker"]) {
      expect(readFileSync(new URL(`../../lib/alerts/${file}.js`, import.meta.url), "utf8")).toMatch(/^import "server-only"/);
    }
    const page = readFileSync(new URL("../../app/settings/notifications/page.js", import.meta.url), "utf8");
    expect(page).toContain("await requireAccessSession()");
    expect(page).not.toMatch(/RESEND_API_KEY|TWILIO_AUTH_TOKEN|TWILIO_FROM_NUMBER|payload/);
    const cli = readFileSync(new URL("../../scripts/check-alerts.js", import.meta.url), "utf8");
    expect(cli).not.toMatch(/setInterval|while\s*\(true\)/);
    expect(cli).toContain("await closeAlertDatabase()");
  });
});
