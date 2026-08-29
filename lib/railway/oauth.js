import "server-only";

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const RAILWAY_OAUTH_AUTHORIZE_URL =
  "https://backboard.railway.com/oauth/auth";
export const RAILWAY_OAUTH_TOKEN_URL =
  "https://backboard.railway.com/oauth/token";
export const RAILWAY_OAUTH_ME_URL = "https://backboard.railway.com/oauth/me";
export const RAILWAY_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "workspace:viewer",
  "offline_access",
];
export const RAILWAY_OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;
export const RAILWAY_OAUTH_STATE_COOKIE = "projectdeck_railway_oauth_state";
export const RAILWAY_OAUTH_VERIFIER_COOKIE =
  "projectdeck_railway_oauth_verifier";
export const RAILWAY_OAUTH_CALLBACK_PATH =
  "/api/integrations/railway/callback";

export class RailwayOAuthError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = "RailwayOAuthError";
    this.code = code;
    this.status = status;
  }
}

export function isRailwayOAuthConfigured(env = process.env) {
  return Boolean(
    env.RAILWAY_OAUTH_CLIENT_ID &&
      env.RAILWAY_OAUTH_CLIENT_SECRET &&
      env.PROJECTDECK_BASE_URL &&
      env.PROVIDER_CREDENTIALS_ENCRYPTION_KEY,
  );
}

export function railwayOAuthCallbackUrl(env = process.env) {
  const baseUrl = String(env.PROJECTDECK_BASE_URL ?? "").replace(/\/+$/, "");
  if (!baseUrl) {
    throw new RailwayOAuthError(
      "configuration_missing",
      "PROJECTDECK_BASE_URL is not configured.",
    );
  }
  return `${baseUrl}${RAILWAY_OAUTH_CALLBACK_PATH}`;
}

function base64url(buffer) {
  return buffer.toString("base64url");
}

export function createRailwayOAuthAttempt() {
  const state = base64url(randomBytes(32));
  const verifier = base64url(randomBytes(64));
  const challenge = base64url(
    createHash("sha256").update(verifier).digest(),
  );

  return { state, verifier, challenge };
}

export function validateOAuthState(received, expected) {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function buildRailwayAuthorizationUrl(
  attempt,
  env = process.env,
) {
  if (!isRailwayOAuthConfigured(env)) {
    throw new RailwayOAuthError(
      "configuration_missing",
      "Railway OAuth is not configured on the ProjectDeck server.",
    );
  }

  const url = new URL(RAILWAY_OAUTH_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: env.RAILWAY_OAUTH_CLIENT_ID,
    redirect_uri: railwayOAuthCallbackUrl(env),
    scope: RAILWAY_OAUTH_SCOPES.join(" "),
    state: attempt.state,
    code_challenge: attempt.challenge,
    code_challenge_method: "S256",
    prompt: "consent",
  }).toString();
  return url;
}

function basicAuthorization(clientId, clientSecret) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function tokenRequest(parameters, { env = process.env, fetchImpl = fetch } = {}) {
  if (!env.RAILWAY_OAUTH_CLIENT_ID || !env.RAILWAY_OAUTH_CLIENT_SECRET) {
    throw new RailwayOAuthError(
      "configuration_missing",
      "Railway OAuth client credentials are not configured.",
    );
  }

  let response;
  try {
    response = await fetchImpl(RAILWAY_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: basicAuthorization(
          env.RAILWAY_OAUTH_CLIENT_ID,
          env.RAILWAY_OAUTH_CLIENT_SECRET,
        ),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(parameters),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new RailwayOAuthError(
      "provider_failed",
      "Railway OAuth is unavailable or timed out.",
    );
  }

  if (!response.ok) {
    throw new RailwayOAuthError(
      response.status === 401 ? "authentication_failed" : "provider_failed",
      "Railway could not complete authorization.",
      response.status,
    );
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new RailwayOAuthError(
      "provider_failed",
      "Railway returned an incomplete authorization response.",
    );
  }
  return payload;
}

export function exchangeRailwayAuthorizationCode(
  { code, verifier },
  options = {},
) {
  return tokenRequest(
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: railwayOAuthCallbackUrl(options.env ?? process.env),
      code_verifier: verifier,
    },
    options,
  );
}

export function refreshRailwayAccessToken(refreshToken, options = {}) {
  return tokenRequest(
    { grant_type: "refresh_token", refresh_token: refreshToken },
    options,
  );
}

export async function fetchRailwayOAuthProfile(
  accessToken,
  { fetchImpl = fetch } = {},
) {
  const response = await fetchImpl(RAILWAY_OAUTH_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new RailwayOAuthError(
      response.status === 401 ? "authentication_failed" : "provider_failed",
      "Railway account identity could not be read.",
      response.status,
    );
  }
  const profile = await response.json();
  if (!profile.sub) {
    throw new RailwayOAuthError(
      "provider_failed",
      "Railway returned an incomplete account identity.",
    );
  }
  return {
    id: profile.sub,
    name: profile.name ?? null,
    email: profile.email ?? null,
    picture: profile.picture ?? null,
  };
}

export function railwayOAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integrations/railway",
    maxAge: RAILWAY_OAUTH_COOKIE_MAX_AGE_SECONDS,
  };
}

