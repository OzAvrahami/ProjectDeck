import { NextResponse } from "next/server";

import { requireAccessSession } from "../../../../../lib/access/server.js";
import { refreshRailwayDiscovery } from "../../../../../lib/railway/connection.js";

export async function POST(request) {
  await requireAccessSession();
  try {
    await refreshRailwayDiscovery();
    return NextResponse.redirect(new URL("/settings?railway=refreshed", request.url), 303);
  } catch {
    return NextResponse.redirect(new URL("/settings?railway=refresh_failed", request.url), 303);
  }
}

