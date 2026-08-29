import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { requireAccessSession } from "../../../../../lib/access/server.js";
import { persistRailwayOAuthConnection } from "../../../../../lib/railway/connection.js";
import { discoverRailwayResources } from "../../../../../lib/railway/discovery.js";
import {
  exchangeRailwayAuthorizationCode,
  fetchRailwayOAuthProfile,
  RAILWAY_OAUTH_STATE_COOKIE,
  RAILWAY_OAUTH_VERIFIER_COOKIE,
  validateOAuthState,
} from "../../../../../lib/railway/oauth.js";

function clearAttemptCookies(response) {
  response.cookies.set(RAILWAY_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/api/integrations/railway",
    sameSite: "lax",
  });
  response.cookies.set(RAILWAY_OAUTH_VERIFIER_COOKIE, "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/api/integrations/railway",
    sameSite: "lax",
  });
  return response;
}

export async function GET(request) {
  await requireAccessSession();
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(RAILWAY_OAUTH_STATE_COOKIE)?.value;
  const verifier = cookieStore.get(RAILWAY_OAUTH_VERIFIER_COOKIE)?.value;
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  if (
    url.searchParams.get("error") ||
    !code ||
    !verifier ||
    !validateOAuthState(state, expectedState)
  ) {
    return clearAttemptCookies(
      NextResponse.redirect(new URL("/settings?railway=oauth_rejected", request.url)),
    );
  }

  try {
    const tokenResponse = await exchangeRailwayAuthorizationCode({ code, verifier });
    const [profile, discovery] = await Promise.all([
      fetchRailwayOAuthProfile(tokenResponse.access_token),
      discoverRailwayResources(tokenResponse.access_token),
    ]);
    await persistRailwayOAuthConnection({ profile, tokenResponse, discovery });
    return clearAttemptCookies(
      NextResponse.redirect(new URL("/settings?railway=connected", request.url)),
    );
  } catch {
    return clearAttemptCookies(
      NextResponse.redirect(new URL("/settings?railway=connection_failed", request.url)),
    );
  }
}

