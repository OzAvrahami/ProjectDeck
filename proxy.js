import { NextResponse } from "next/server";

import { accessDecision } from "./lib/access/protection.js";
import {
  isAccessConfigured,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "./lib/access/session.js";

export async function proxy(request) {
  const configured = isAccessConfigured();
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessionValid = configured
    ? await verifySessionToken(token)
    : false;
  const decision = accessDecision({
    pathname: request.nextUrl.pathname,
    configured,
    sessionValid,
  });

  if (decision === "redirect_home") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (decision === "redirect_login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
