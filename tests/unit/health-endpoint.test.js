import { describe, expect, it } from "vitest";

import { GET } from "../../app/api/health/route.js";
import { accessDecision, isPublicAccessPath } from "../../lib/access/protection.js";

describe("ProjectDeck liveness endpoint", () => {
  it("returns only status=ok with HTTP 200", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("is reachable without a configured or valid ProjectDeck session", () => {
    expect(isPublicAccessPath("/api/health")).toBe(true);
    expect(
      accessDecision({
        pathname: "/api/health",
        configured: true,
        sessionValid: false,
      }),
    ).toBe("allow");
    expect(
      accessDecision({
        pathname: "/api/health",
        configured: false,
        sessionValid: false,
      }),
    ).toBe("allow");
  });

  it("does not expose environment, credential, session, or dependency state", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalRailwayToken = process.env.RAILWAY_TOKEN;
    const originalSessionSecret = process.env.PROJECTDECK_SESSION_SECRET;
    process.env.DATABASE_URL = "postgresql://secret-database";
    process.env.RAILWAY_TOKEN = "secret-railway-token";
    process.env.PROJECTDECK_SESSION_SECRET = "secret-session-value";

    try {
      const body = await GET().text();
      expect(body).toBe('{"status":"ok"}');
      expect(body).not.toContain("secret");
      expect(body).not.toContain("database");
      expect(body).not.toContain("railway");
      expect(body).not.toContain("session");
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      if (originalRailwayToken === undefined) delete process.env.RAILWAY_TOKEN;
      else process.env.RAILWAY_TOKEN = originalRailwayToken;
      if (originalSessionSecret === undefined) delete process.env.PROJECTDECK_SESSION_SECRET;
      else process.env.PROJECTDECK_SESSION_SECRET = originalSessionSecret;
    }
  });
});
