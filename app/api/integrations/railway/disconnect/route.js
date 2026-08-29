import { NextResponse } from "next/server";

import { requireAccessSession } from "../../../../../lib/access/server.js";
import { disconnectRailwayConnection } from "../../../../../lib/railway/connection.js";

export async function POST(request) {
  await requireAccessSession();
  await disconnectRailwayConnection();
  return NextResponse.redirect(new URL("/settings?railway=disconnected", request.url), 303);
}

