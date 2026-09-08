import "server-only";
import { alertBaseUrl, normalizePhone, validEmail } from "./config.js";

export function notificationConfiguration(env = process.env) {
  return {
    baseUrlConfigured: Boolean(alertBaseUrl(env)),
    emailConfigured: Boolean(env.RESEND_API_KEY?.trim() && validEmail(env.PROJECTDECK_ALERT_EMAIL_FROM)),
    smsConfigured: Boolean(/^AC[0-9a-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID ?? "") && env.TWILIO_AUTH_TOKEN?.trim() && normalizePhone(env.TWILIO_FROM_NUMBER)),
  };
}

export function deliveryPayload(channel, recipient, content, env = process.env) {
  return channel === "email"
    ? { from: env.PROJECTDECK_ALERT_EMAIL_FROM || null, to: recipient, subject: content.subject, text: content.text }
    : { from: normalizePhone(env.TWILIO_FROM_NUMBER), to: recipient, body: content.sms };
}

export async function sendNotification(delivery, { env = process.env, fetchImpl = fetch } = {}) {
  const channel = delivery.channel;
  const configuration = notificationConfiguration(env);
  if (!(channel === "email" ? configuration.emailConfigured : configuration.smsConfigured)) {
    return { status: "unconfigured", failureClassification: "provider_unconfigured" };
  }
  const payload = delivery.payload;
  try {
    const email = channel === "email";
    const response = await fetchImpl(email ? "https://api.resend.com/emails"
      : `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: email ? {
        Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json",
        "Idempotency-Key": `projectdeck/${delivery.id}`, "User-Agent": "ProjectDeck-alerts",
      } : {
        Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: email ? JSON.stringify({ ...payload, to: [payload.to] })
        : new URLSearchParams({ From: payload.from, To: payload.to, Body: payload.body }).toString(),
    });
    if (!response.ok) {
      if (response.status === 429) return { status: "retry", failureClassification: "rate_limited" };
      if (response.status >= 500 || response.status === 408) return {
        status: email ? "retry" : "uncertain", failureClassification: "provider_acceptance_unknown",
      };
      return { status: "failed", failureClassification: [401, 403].includes(response.status) ? "authentication_failed" : "request_rejected" };
    }
    const result = await response.json();
    const id = email ? result.id : result.sid;
    if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) {
      return { status: email ? "retry" : "uncertain", failureClassification: "provider_acceptance_unknown" };
    }
    return { status: "sent", providerMessageId: id, failureClassification: null };
  } catch {
    return { status: channel === "email" ? "retry" : "uncertain", failureClassification: "provider_acceptance_unknown" };
  }
}
