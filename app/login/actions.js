"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createSessionToken,
  isAccessConfigured,
  passwordMatches,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "../../lib/access/session.js";

export async function loginAction(_previousState, formData) {
  if (!isAccessConfigured()) {
    return {
      status: "error",
      message: "Private access is unavailable because the server is not configured.",
    };
  }

  const password = formData.get("password");

  if (
    typeof password !== "string" ||
    !passwordMatches(password, process.env.PROJECTDECK_ACCESS_PASSWORD)
  ) {
    return { status: "error", message: "Invalid password." };
  }

  const token = await createSessionToken();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  redirect("/");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
  redirect("/login");
}
