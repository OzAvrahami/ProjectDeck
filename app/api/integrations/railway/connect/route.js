import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { requireAccessSession } from "../../../../../lib/access/server.js";
import {
  buildRailwayAuthorizationUrl,
  createRailwayOAuthAttempt,
  railwayOAuthCookieOptions,
  RAILWAY_OAUTH_STATE_COOKIE,
  RAILWAY_OAUTH_VERIFIER_COOKIE,
} from "../../../../../lib/railway/oauth.js";

export async function GET(request) {
  await requireAccessSession();
  try {
    const attempt = createRailwayOAuthAttempt();
    const cookieStore = await cookies();
    const options = railwayOAuthCookieOptions();
    cookieStore.set(RAILWAY_OAUTH_STATE_COOKIE, attempt.state, options);
    cookieStore.set(RAILWAY_OAUTH_VERIFIER_COOKIE, attempt.verifier, options);
    return NextResponse.redirect(buildRailwayAuthorizationUrl(attempt));
  } catch {
    return NextResponse.redirect(
      new URL("/settings?railway=configuration_required", request.url),
    );
  }
}

