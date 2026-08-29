import { describe, expect, it, vi } from "vitest";

import {
  decryptProviderCredentials,
  encryptProviderCredentials,
} from "../../lib/provider-connections/credentials.js";
import { providerConnectionPublicView } from "../../lib/provider-connections/queries.js";
import {
  clearRailwayAccessToken,
  getRailwayAccessToken,
} from "../../lib/railway/token-manager.js";
import { disconnectRailwayConnection } from "../../lib/railway/connection.js";

vi.mock("server-only", () => ({}));

const KEY = Buffer.alloc(32, 7).toString("base64");
const WRONG_KEY = Buffer.alloc(32, 8).toString("base64");

describe("provider credential encryption", () => {
  it("round-trips credentials without storing plaintext", () => {
    const envelope = encryptProviderCredentials(
      { refreshToken: "refresh-secret" },
      KEY,
    );

    expect(JSON.stringify(envelope)).not.toContain("refresh-secret");
    expect(decryptProviderCredentials(envelope, KEY)).toEqual({
      refreshToken: "refresh-secret",
    });
  });

  it("fails safely with the wrong encryption key", () => {
    const envelope = encryptProviderCredentials(
      { refreshToken: "refresh-secret" },
      KEY,
    );
    expect(() => decryptProviderCredentials(envelope, WRONG_KEY)).toThrow(
      "could not be decrypted",
    );
  });

  it("never serializes credential material into UI connection props", () => {
    const view = providerConnectionPublicView({
      id: "connection",
      provider: "railway",
      encryptedCredentials: { ciphertext: "secret-material" },
      displayMetadata: { serviceCount: 2 },
    });
    expect(view.encryptedCredentials).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain("secret-material");
  });
});

describe("Railway token lifecycle", () => {
  it("disconnect removes usable credential material while preserving the connection record", async () => {
    const updateConnection = vi.fn().mockResolvedValue({ connectionState: "disconnected" });
    const clearToken = vi.fn();
    await disconnectRailwayConnection({
      getConnection: vi.fn().mockResolvedValue({ id: "connection" }),
      updateConnection,
      clearToken,
    });
    expect(clearToken).toHaveBeenCalledWith("connection");
    expect(updateConnection).toHaveBeenCalledWith("connection", {
      connectionState: "disconnected",
      encryptedCredentials: null,
    });
  });

  it("refreshes an expired access token and persists a rotated refresh token encrypted", async () => {
    clearRailwayAccessToken("connection-rotation");
    const persistConnection = vi.fn().mockResolvedValue({});
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "rotated-refresh",
          expires_in: 3600,
        }),
        { status: 200 },
      ),
    );
    const token = await getRailwayAccessToken("connection-rotation", {
      env: {
        RAILWAY_OAUTH_CLIENT_ID: "client",
        RAILWAY_OAUTH_CLIENT_SECRET: "secret",
        PROVIDER_CREDENTIALS_ENCRYPTION_KEY: KEY,
      },
      fetchImpl,
      loadConnection: vi.fn().mockResolvedValue({
        connectionState: "connected",
        encryptedCredentials: encryptProviderCredentials(
          { refreshToken: "old-refresh" },
          KEY,
        ),
      }),
      persistConnection,
    });

    expect(token).toBe("new-access");
    const persisted = persistConnection.mock.calls[0][1];
    expect(JSON.stringify(persisted)).not.toContain("rotated-refresh");
    expect(
      decryptProviderCredentials(persisted.encryptedCredentials, KEY),
    ).toEqual({ refreshToken: "rotated-refresh" });
  });

  it("marks the connection for reconnection when refresh fails", async () => {
    clearRailwayAccessToken("connection-failure");
    const persistConnection = vi.fn().mockResolvedValue({});
    await expect(
      getRailwayAccessToken("connection-failure", {
        env: {
          RAILWAY_OAUTH_CLIENT_ID: "client",
          RAILWAY_OAUTH_CLIENT_SECRET: "secret",
          PROVIDER_CREDENTIALS_ENCRYPTION_KEY: KEY,
        },
        fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
        loadConnection: vi.fn().mockResolvedValue({
          connectionState: "connected",
          encryptedCredentials: encryptProviderCredentials(
            { refreshToken: "old-refresh" },
            KEY,
          ),
        }),
        persistConnection,
      }),
    ).rejects.toMatchObject({ code: "reconnect_required" });
    expect(persistConnection).toHaveBeenCalledWith("connection-failure", {
      connectionState: "reconnect_required",
    });
  });
});
