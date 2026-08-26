import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  isAccessConfigured,
  passwordMatches,
  SESSION_DURATION_SECONDS,
  sessionCookieOptions,
  verifySessionToken,
} from "../../lib/access/session.js";
import {
  accessDecision,
  isPublicAccessPath,
} from "../../lib/access/protection.js";

const SECRET = "test-only-session-secret-with-more-than-32-characters";
const ISSUED_AT = new Date("2026-08-01T00:00:00Z");

describe("single-user access session", () => {
  it("accepts a valid signed session", async () => {
    const token = await createSessionToken({ secret: SECRET, now: ISSUED_AT });

    await expect(
      verifySessionToken(token, {
        secret: SECRET,
        now: new Date("2026-08-15T00:00:00Z"),
      }),
    ).resolves.toBe(true);
  });

  it("rejects an invalid or tampered session", async () => {
    const token = await createSessionToken({ secret: SECRET, now: ISSUED_AT });
    const parts = token.split(".");
    parts[2] = `${parts[2][0] === "a" ? "b" : "a"}${parts[2].slice(1)}`;

    await expect(
      verifySessionToken(parts.join("."), {
        secret: SECRET,
        now: new Date("2026-08-15T00:00:00Z"),
      }),
    ).resolves.toBe(false);
    await expect(
      verifySessionToken("not-a-token", { secret: SECRET }),
    ).resolves.toBe(false);
  });

  it("rejects an expired session", async () => {
    const token = await createSessionToken({ secret: SECRET, now: ISSUED_AT });

    await expect(
      verifySessionToken(token, {
        secret: SECRET,
        now: new Date("2026-09-15T00:00:00Z"),
      }),
    ).resolves.toBe(false);
  });

  it("compares the private password without exposing it", () => {
    expect(passwordMatches("correct horse", "correct horse")).toBe(true);
    expect(passwordMatches("wrong horse", "correct horse")).toBe(false);
    expect(passwordMatches("", "correct horse")).toBe(false);
  });

  it("fails closed when either access setting is missing or weak", () => {
    expect(
      isAccessConfigured({
        PROJECTDECK_ACCESS_PASSWORD: "password",
        PROJECTDECK_SESSION_SECRET: SECRET,
      }),
    ).toBe(true);
    expect(
      isAccessConfigured({ PROJECTDECK_SESSION_SECRET: SECRET }),
    ).toBe(false);
    expect(
      isAccessConfigured({
        PROJECTDECK_ACCESS_PASSWORD: "password",
        PROJECTDECK_SESSION_SECRET: "too-short",
      }),
    ).toBe(false);
  });

  it("uses a time-limited HttpOnly cookie with production Secure mode", () => {
    expect(sessionCookieOptions({ NODE_ENV: "production" })).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });
    expect(sessionCookieOptions({ NODE_ENV: "development" }).secure).toBe(
      false,
    );
  });
});

describe("route protection decisions", () => {
  it("excludes only the login route from product protection", () => {
    expect(isPublicAccessPath("/login")).toBe(true);
    expect(isPublicAccessPath("/")).toBe(false);
    expect(isPublicAccessPath("/setup/github")).toBe(false);
  });

  it("requires a valid configured session for protected routes", () => {
    expect(
      accessDecision({ pathname: "/projects", configured: true, sessionValid: true }),
    ).toBe("allow");
    expect(
      accessDecision({ pathname: "/projects", configured: true, sessionValid: false }),
    ).toBe("redirect_login");
    expect(
      accessDecision({ pathname: "/issues", configured: false, sessionValid: false }),
    ).toBe("redirect_login");
  });

  it("avoids login loops and redirects signed-in visitors home", () => {
    expect(
      accessDecision({ pathname: "/login", configured: false, sessionValid: false }),
    ).toBe("allow");
    expect(
      accessDecision({ pathname: "/login", configured: true, sessionValid: true }),
    ).toBe("redirect_home");
  });
});
