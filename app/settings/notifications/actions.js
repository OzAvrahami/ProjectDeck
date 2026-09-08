"use server";

import { revalidatePath } from "next/cache";
import { requireAccessSession } from "../../../lib/access/server.js";
import { validateNotificationSettings } from "../../../lib/alerts/config.js";
import { getAlertDatabase } from "../../../lib/alerts/database.js";
import { createTestDelivery, saveNotificationSettings } from "../../../lib/alerts/store.js";
import { deliverPendingNotifications } from "../../../lib/alerts/worker.js";

export async function saveNotificationsAction(_previous, formData) {
  await requireAccessSession();
  const validation = validateNotificationSettings(Object.fromEntries(formData));
  if (!validation.valid) return { ...validation, message: "Review the recipient fields.", status: "error" };
  try {
    await saveNotificationSettings(getAlertDatabase(), validation.values);
  } catch {
    return { ...validation, message: "Settings could not be saved. Check database connectivity and migrations.", status: "error" };
  }
  revalidatePath("/settings/notifications");
  return { ...validation, message: "Notification settings saved.", status: "saved" };
}

export async function sendTestNotificationAction(_previous, formData) {
  await requireAccessSession();
  try {
    const db = getAlertDatabase();
    const id = await createTestDelivery(db, formData.get("channel"), formData.get("testKey"));
    await deliverPendingNotifications({ db, testId: id });
  } catch {
    return { status: "error", message: "Test could not run. Save a recipient, check configuration, and wait one minute between tests on the same channel." };
  }
  revalidatePath("/settings/notifications");
  return { status: "complete", message: "Test handled. Review its delivery status in Test history below." };
}
