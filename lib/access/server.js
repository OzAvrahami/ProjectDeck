import "server-only";

import { cookies } from "next/headers";

import {
  isAccessConfigured,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "./session.js";

export class AccessDeniedError extends Error {
  constructor() {
    super("Private ProjectDeck access is required.");
    this.name = "AccessDeniedError";
  }
}

export async function hasAccessSession() {
  if (!isAccessConfigured()) {
    return false;
  }

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

export async function requireAccessSession() {
  if (!(await hasAccessSession())) {
    throw new AccessDeniedError();
  }
}
