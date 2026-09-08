"use client";
import { useActionState } from "react";
import { saveNotificationsAction, sendTestNotificationAction } from "../../app/settings/notifications/actions.js";

const inputClass = "mt-2 w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm";
const buttonClass = "rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-accent disabled:opacity-50";

export function NotificationSettingsForm({ settings }) {
  const [state, action, pending] = useActionState(saveNotificationsAction, { values: settings, errors: {} });
  const values = state.values;
  return <form action={action} className="space-y-6">
    <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" name="alertsEnabled" defaultChecked={values.alertsEnabled} />Alerts enabled</label>
    <p className="text-xs leading-5 text-muted">Each Project also needs its Health alerts toggle enabled in Edit Project. A scheduled job must be configured to check Health when ProjectDeck is closed.</p>
    <fieldset className="space-y-3 border-t border-line pt-5">
      <legend className="text-sm font-semibold">Email</legend>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="emailEnabled" defaultChecked={values.emailEnabled} />Send Email alerts</label>
      <label className="block text-sm" htmlFor="email-recipient">Email recipient</label>
      <input className={inputClass} id="email-recipient" name="emailRecipient" type="email" autoComplete="email" maxLength={254} defaultValue={values.emailRecipient ?? ""} aria-invalid={Boolean(state.errors.emailRecipient)} aria-describedby="email-error" />
      <p id="email-error" className="text-xs text-attention">{state.errors.emailRecipient}</p>
    </fieldset>
    <fieldset className="space-y-3 border-t border-line pt-5">
      <legend className="text-sm font-semibold">SMS</legend>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="smsEnabled" defaultChecked={values.smsEnabled} />Send SMS alerts</label>
      <label className="block text-sm" htmlFor="phone-number">Phone number</label>
      <input className={inputClass} id="phone-number" name="phoneNumber" type="tel" autoComplete="tel" maxLength={32} defaultValue={values.phoneNumber ?? ""} placeholder="+972…" aria-invalid={Boolean(state.errors.phoneNumber)} aria-describedby="phone-help phone-error" />
      <p id="phone-help" className="text-xs text-muted">International E.164 format, including + and the country code.</p>
      <p id="phone-error" className="text-xs text-attention">{state.errors.phoneNumber}</p>
    </fieldset>
    <button className={buttonClass} type="submit" disabled={pending}>{pending ? "Saving…" : "Save Notifications"}</button>
    {state.message ? <p role="status" className="text-sm text-subtle">{state.message}</p> : null}
  </form>;
}

export function TestNotificationForm({ channel, testKey, configured, recipientSaved }) {
  const [state, action, pending] = useActionState(sendTestNotificationAction, {});
  return <form action={action} className="space-y-2">
    <input name="channel" type="hidden" value={channel} />
    <input name="testKey" type="hidden" value={testKey} />
    <button className={buttonClass} type="submit" disabled={pending || !configured || !recipientSaved}>
      {pending ? "Sending…" : `Send test ${channel === "email" ? "Email" : "SMS"}`}
    </button>
    {state.message ? <p role="status" className="max-w-md text-xs text-subtle">{state.message}</p> : null}
  </form>;
}
