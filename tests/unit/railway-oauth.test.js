import { describe, expect, it, vi } from "vitest";

import {
  buildRailwayAuthorizationUrl,
  createRailwayOAuthAttempt,
  RAILWAY_OAUTH_SCOPES,
  validateOAuthState,
} from "../../lib/railway/oauth.js";

vi.mock("server-only", () => ({}));

const ENV = {
  RAILWAY_OAUTH_CLIENT_ID: "client-id",
  RAILWAY_OAUTH_CLIENT_SECRET: "client-secret",
  PROJECTDECK_BASE_URL: "https://projectdeck.example",
  PROVIDER_CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
};

describe("Railway OAuth", () => {
  it("generates random state and PKCE S256 parameters", () => {
    const first = createRailwayOAuthAttempt();
    const second = createRailwayOAuthAttempt();
    expect(first.state).not.toBe(second.state);
    expect(first.verifier).not.toBe(first.challenge);
    expect(first.challenge.length).toBeGreaterThan(30);
  });

  it("accepts the exact state and rejects missing or invalid state", () => {
    expect(validateOAuthState("expected", "expected")).toBe(true);
    expect(validateOAuthState("tampered", "expected")).toBe(false);
    expect(validateOAuthState(null, "expected")).toBe(false);
  });

  it("requests only the read-only persistent scopes and never exposes the client secret", () => {
    const url = buildRailwayAuthorizationUrl(
      { state: "state", verifier: "verifier", challenge: "challenge" },
      ENV,
    );
    expect(url.searchParams.get("scope").split(" ")).toEqual(
      RAILWAY_OAUTH_SCOPES,
    );
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://projectdeck.example/api/integrations/railway/callback",
    );
    expect(url.toString()).not.toContain("client-secret");
    expect(url.searchParams.has("client_secret")).toBe(false);
  });
});

