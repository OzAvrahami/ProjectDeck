import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AppShell } from "../../../components/app-shell.js";
import { AlertHistory } from "../../../components/notifications/alert-history.js";
import { NotificationSettingsForm, TestNotificationForm } from "../../../components/notifications/notification-settings-form.js";
import { requireAccessSession } from "../../../lib/access/server.js";
import { getAlertDatabase } from "../../../lib/alerts/database.js";
import { notificationConfiguration } from "../../../lib/alerts/providers.js";
import { readAlertHistory, readNotificationSettings } from "../../../lib/alerts/store.js";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await requireAccessSession();
  const configuration = notificationConfiguration();
  let data;
  try {
    const db = getAlertDatabase();
    const [settings, history] = await Promise.all([readNotificationSettings(db), readAlertHistory(db)]);
    data = { settings, history };
  } catch { /* Render an explicit migration/database failure, never false defaults. */ }
  return <AppShell><section className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
    <Link href="/settings" className="text-sm underline">← Settings</Link>
    <h1 className="mt-5 text-3xl font-semibold">Notifications</h1>
    <p className="mt-3 text-sm leading-6 text-subtle">Operational Health alerts and recovery by Email and SMS. Down alerts immediately; Degraded requires a later matching check after five minutes, Health unknown after ten minutes.</p>
    <div className="my-6 space-y-2 rounded-xl border border-line bg-surface p-5 text-sm">
      <p>{configuration.emailConfigured ? "Email provider configured" : "Email provider not configured"}</p>
      <p>{configuration.smsConfigured ? "SMS provider configured" : "SMS provider not configured"}</p>
      {!configuration.baseUrlConfigured ? <p>ProjectDeck base URL missing or invalid. Delivery is blocked until configured.</p> : null}
      {data ? <p>{data.settings.alertsEnabled ? "Alerts enabled" : "Alerts disabled"}</p> : null}
    </div>
    {data ? <>
      <div className="max-w-xl rounded-xl border border-line bg-surface p-6"><NotificationSettingsForm settings={{
        alertsEnabled: data.settings.alertsEnabled, emailEnabled: data.settings.emailEnabled,
        emailRecipient: data.settings.emailRecipient, smsEnabled: data.settings.smsEnabled, phoneNumber: data.settings.phoneNumber,
      }} /></div>
      <section className="mt-8 space-y-4" aria-labelledby="test-notifications">
        <h2 id="test-notifications" className="text-lg font-semibold">Test notifications</h2>
        <p className="text-sm text-subtle">Save recipients first. Each click sends a real TEST message to the saved recipient, even when alerts are disabled. SMS charges may apply. Tests do not create incidents.</p>
        <div className="flex flex-wrap gap-4">
          <TestNotificationForm channel="email" testKey={randomUUID()} configured={configuration.emailConfigured && configuration.baseUrlConfigured} recipientSaved={Boolean(data.settings.emailRecipient)} />
          <TestNotificationForm channel="sms" testKey={randomUUID()} configured={configuration.smsConfigured && configuration.baseUrlConfigured} recipientSaved={Boolean(data.settings.phoneNumber)} />
        </div>
      </section>
      <AlertHistory history={data.history} />
    </> : <p role="alert" className="text-sm">Notification settings unavailable. Check database connectivity and apply the reviewed alerting migration before enabling this feature.</p>}
  </section></AppShell>;
}
