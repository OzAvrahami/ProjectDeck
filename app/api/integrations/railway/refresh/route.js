import { NextResponse } from "next/server";

import { requireAccessSession } from "../../../../../lib/access/server.js";
import { refreshRailwayIntegration } from "../../../../../lib/railway/refresh.js";
import { RAILWAY_MAPPINGS_PATH } from "../../../../../lib/railway/routes.js";

export async function POST(request) {
  await requireAccessSession();
  const mappingsReturn =
    new URL(request.url).searchParams.get("returnTo") === "mappings";
  const successPath = mappingsReturn
    ? RAILWAY_MAPPINGS_PATH
    : "/settings?railway=refreshed";
  const failurePath = mappingsReturn
    ? `${RAILWAY_MAPPINGS_PATH}?railway=refresh_failed`
    : "/settings?railway=refresh_failed";
  try {
    await refreshRailwayIntegration();
    return NextResponse.redirect(new URL(successPath, request.url), 303);
  } catch {
    return NextResponse.redirect(new URL(failurePath, request.url), 303);
  }
}
