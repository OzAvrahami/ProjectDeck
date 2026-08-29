import "server-only";

import {
  decryptProviderCredentials,
  encryptProviderCredentials,
} from "../provider-connections/credentials.js";
import {
  getProviderConnectionById,
  updateProviderConnection,
} from "../provider-connections/queries.js";
import { RailwayOAuthError, refreshRailwayAccessToken } from "./oauth.js";

const ACCESS_TOKEN_EXPIRY_SKEW_MS = 60_000;
const accessTokenCache = new Map();

export function cacheRailwayAccessToken(
  connectionId,
  accessToken,
  expiresInSeconds = 3600,
) {
  accessTokenCache.set(connectionId, {
    accessToken,
    expiresAt: Date.now() + Math.max(0, Number(expiresInSeconds)) * 1000,
  });
}

export function clearRailwayAccessToken(connectionId) {
  accessTokenCache.delete(connectionId);
}

export async function getRailwayAccessToken(
  connectionId,
  {
    fetchImpl = fetch,
    env = process.env,
    loadConnection = getProviderConnectionById,
    persistConnection = updateProviderConnection,
    now = () => Date.now(),
  } = {},
) {
  const cached = accessTokenCache.get(connectionId);
  if (cached && cached.expiresAt - ACCESS_TOKEN_EXPIRY_SKEW_MS > now()) {
    return cached.accessToken;
  }

  const connection = await loadConnection(connectionId);
  if (
    !connection ||
    connection.connectionState !== "connected" ||
    !connection.encryptedCredentials
  ) {
    throw new RailwayOAuthError(
      "reconnect_required",
      "Railway needs to be reconnected.",
    );
  }

  let credentials;
  try {
    credentials = decryptProviderCredentials(
      connection.encryptedCredentials,
      env.PROVIDER_CREDENTIALS_ENCRYPTION_KEY,
    );
  } catch {
    await persistConnection(connectionId, {
      connectionState: "reconnect_required",
    });
    throw new RailwayOAuthError(
      "reconnect_required",
      "Railway needs to be reconnected.",
    );
  }

  try {
    const response = await refreshRailwayAccessToken(credentials.refreshToken, {
      fetchImpl,
      env,
    });
    const refreshToken = response.refresh_token ?? credentials.refreshToken;
    const encryptedCredentials = encryptProviderCredentials(
      { refreshToken },
      env.PROVIDER_CREDENTIALS_ENCRYPTION_KEY,
    );

    // Refresh tokens rotate. Persist the newest encrypted token before the
    // access token is made available to callers.
    await persistConnection(connectionId, {
      connectionState: "connected",
      encryptedCredentials,
    });
    cacheRailwayAccessToken(
      connectionId,
      response.access_token,
      response.expires_in,
    );
    return response.access_token;
  } catch (error) {
    clearRailwayAccessToken(connectionId);
    await persistConnection(connectionId, {
      connectionState: "reconnect_required",
    });
    throw error instanceof RailwayOAuthError
      ? new RailwayOAuthError(
          "reconnect_required",
          "Railway needs to be reconnected.",
        )
      : error;
  }
}

