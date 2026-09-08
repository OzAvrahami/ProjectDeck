export const DEFAULT_NOTIFICATION_SETTINGS = {
  alertsEnabled: false, emailEnabled: false, emailRecipient: "", smsEnabled: false, phoneNumber: "",
};

export function validEmail(value) {
  return typeof value === "string" && value.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
}

export function normalizePhone(value) {
  const phone = String(value ?? "").trim().replace(/[ ()-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export function validateNotificationSettings(input) {
  const on = (value) => value === true || value === "on";
  const values = {
    alertsEnabled: on(input.alertsEnabled), emailEnabled: on(input.emailEnabled),
    emailRecipient: String(input.emailRecipient ?? "").trim(),
    smsEnabled: on(input.smsEnabled), phoneNumber: String(input.phoneNumber ?? "").trim(),
  };
  const errors = {};
  if ((values.emailEnabled || values.emailRecipient) && !validEmail(values.emailRecipient)) {
    errors.emailRecipient = "Enter one valid email address.";
  }
  if (values.smsEnabled || values.phoneNumber) {
    const phone = normalizePhone(values.phoneNumber);
    if (phone) values.phoneNumber = phone;
    else errors.phoneNumber = "Use an international E.164 number, starting with + and the country code.";
  }
  return { valid: !Object.keys(errors).length, values, errors };
}

export function alertBaseUrl(env = process.env) {
  try {
    const url = new URL(env.PROJECTDECK_BASE_URL);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(env.NODE_ENV !== "production" && local && url.protocol === "http:")) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch { return null; }
}
