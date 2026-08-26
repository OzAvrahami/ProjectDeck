import { createHash, timingSafeEqual } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE_NAME = "projectdeck_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;
const SESSION_ISSUER = "projectdeck";
const SESSION_AUDIENCE = "projectdeck-private-access";
const SESSION_MARKER = "private-access";

function normalizedSecret(secret) {
  const value = String(secret ?? "");
  return value.length >= 32 ? new TextEncoder().encode(value) : null;
}

export function isAccessConfigured(environment = process.env) {
  return Boolean(
    environment.PROJECTDECK_ACCESS_PASSWORD &&
      normalizedSecret(environment.PROJECTDECK_SESSION_SECRET),
  );
}

export function passwordMatches(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string" || !expected) {
    return false;
  }

  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

export async function createSessionToken({
  secret = process.env.PROJECTDECK_SESSION_SECRET,
  now = new Date(),
} = {}) {
  const key = normalizedSecret(secret);

  if (!key) {
    throw new Error("ProjectDeck access is not configured.");
  }

  const issuedAt = Math.floor(now.getTime() / 1000);

  return new SignJWT({ access: SESSION_MARKER })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_DURATION_SECONDS)
    .sign(key);
}

export async function verifySessionToken(
  token,
  {
    secret = process.env.PROJECTDECK_SESSION_SECRET,
    now = new Date(),
  } = {},
) {
  const key = normalizedSecret(secret);

  if (!key || typeof token !== "string" || !token) {
    return false;
  }

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
      currentDate: now,
    });

    return payload.access === SESSION_MARKER;
  } catch {
    return false;
  }
}

export function sessionCookieOptions(environment = process.env) {
  return {
    httpOnly: true,
    secure: environment.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  };
}
