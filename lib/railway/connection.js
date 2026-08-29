import "server-only";

import {
  encryptProviderCredentials,
} from "../provider-connections/credentials.js";
import {
  deleteProviderResourceAssociation,
  getActiveProviderConnection,
  listProviderConnections,
  listProviderResourceAssociations,
  updateProviderConnection,
  upsertProviderConnection,
  upsertProviderResourceAssociation,
  providerConnectionPublicView,
} from "../provider-connections/queries.js";
import { listPortfolioProjects } from "../projects/queries.js";
import {
  findAutomaticRailwayAssociations,
  unmappedRailwayResources,
} from "./associations.js";
import {
  discoverRailwayResources,
  flattenRailwayServices,
  summarizeRailwayDiscovery,
} from "./discovery.js";
import { cacheRailwayAccessToken, clearRailwayAccessToken, getRailwayAccessToken } from "./token-manager.js";

export async function persistRailwayOAuthConnection({
  profile,
  tokenResponse,
  discovery,
  env = process.env,
}) {
  if (!tokenResponse.refresh_token) {
    throw new Error("Railway did not issue persistent offline access.");
  }

  const encryptedCredentials = encryptProviderCredentials(
    { refreshToken: tokenResponse.refresh_token },
    env.PROVIDER_CREDENTIALS_ENCRYPTION_KEY,
  );
  const connection = await upsertProviderConnection({
    provider: "railway",
    providerAccountId: profile.id,
    displayName: profile.name ?? profile.email ?? "Railway account",
    connectionState: "connected",
    grantedScopes: String(tokenResponse.scope ?? "")
      .split(/\s+/)
      .filter(Boolean),
    selectedWorkspaces: discovery.workspaces.map(({ id, name }) => ({ id, name })),
    encryptedCredentials,
    displayMetadata: summarizeRailwayDiscovery(discovery),
    lastDiscoveredAt: new Date(),
  });
  cacheRailwayAccessToken(
    connection.id,
    tokenResponse.access_token,
    tokenResponse.expires_in,
  );
  await applyAutomaticRailwayAssociations(connection, discovery);
  return connection;
}

async function applyAutomaticRailwayAssociations(connection, discovery) {
  const projects = await listPortfolioProjects();
  const existing = await listProviderResourceAssociations(connection.id);
  const existingIds = new Set(existing.map(({ externalId }) => externalId));
  const { matches, ambiguous } = findAutomaticRailwayAssociations(
    discovery,
    projects,
  );

  await Promise.all(
    matches.filter(({ resource }) => !existingIds.has(resource.externalId)).map(({ project, resource }) =>
      upsertProviderResourceAssociation({
        providerConnectionId: connection.id,
        projectId: project.id,
        componentId: resolveComponentId(project, resource.sourceRepository),
        providerResourceType: "service_environment",
        externalId: resource.externalId,
        displayName: `${resource.projectName} · ${resource.environmentName} · ${resource.serviceName}`,
        associationSource: "automatic",
        enabled: true,
        affectsProjectHealth: true,
        metadata: resource,
      }),
    ),
  );
  return {
    matchedCount: matches.filter(({ resource }) => !existingIds.has(resource.externalId)).length,
    ambiguous,
  };
}

function resolveComponentId(project, repositoryIdentity) {
  const resource = (project.githubRepositories ?? []).find((candidate) => {
    try {
      const url = new URL(candidate.url);
      return url.pathname.replace(/^\/+|\/+$/g, "").toLowerCase() === repositoryIdentity;
    } catch {
      return false;
    }
  });
  return resource?.componentId ?? null;
}

export async function refreshRailwayDiscovery({ fetchImpl = fetch } = {}) {
  const connection = await getActiveProviderConnection("railway");
  if (!connection) throw new Error("Railway is not connected.");
  const accessToken = await getRailwayAccessToken(connection.id, { fetchImpl });
  const discovery = await discoverRailwayResources(accessToken, { fetchImpl });
  await updateProviderConnection(connection.id, {
    selectedWorkspaces: discovery.workspaces.map(({ id, name }) => ({ id, name })),
    displayMetadata: summarizeRailwayDiscovery(discovery),
    lastDiscoveredAt: new Date(),
    connectionState: "connected",
  });
  const associations = await applyAutomaticRailwayAssociations(
    connection,
    discovery,
  );
  return { connection, discovery, associations };
}

export async function disconnectRailwayConnection({
  getConnection = getActiveProviderConnection,
  updateConnection = updateProviderConnection,
  clearToken = clearRailwayAccessToken,
} = {}) {
  const connection = await getConnection("railway");
  if (!connection) return null;
  clearToken(connection.id);
  return updateConnection(connection.id, {
    connectionState: "disconnected",
    encryptedCredentials: null,
  });
}

export async function getRailwayIntegrationView() {
  const connections = await listProviderConnections("railway");
  const connection =
    connections.find(({ connectionState }) => connectionState === "connected") ??
    connections[0] ??
    null;
  if (!connection) {
    return {
      connection: null,
      associations: [],
      unmapped: [],
      counts: { workspaces: 0, projects: 0, services: 0 },
    };
  }
  const associations = await listProviderResourceAssociations(connection.id);
  const discovery = {
    workspaces: connection.displayMetadata?.workspaces ?? [],
  };
  return {
    connection: providerConnectionPublicView(connection),
    associations,
    unmapped: unmappedRailwayResources(discovery, associations),
    counts: {
      workspaces: connection.displayMetadata?.workspaceCount ?? 0,
      projects: connection.displayMetadata?.projectCount ?? 0,
      services: connection.displayMetadata?.serviceCount ?? 0,
    },
  };
}

export async function associateDiscoveredRailwayResource({
  project,
  componentId = null,
  externalId,
  affectsProjectHealth = true,
}, {
  getConnection = getActiveProviderConnection,
  upsertAssociation = upsertProviderResourceAssociation,
} = {}) {
  const connection = await getConnection("railway");
  if (!connection) throw new Error("Railway is not connected.");
  if (
    componentId &&
    !(project.components ?? []).some(({ id }) => id === componentId)
  ) {
    throw new Error("The selected Component does not belong to this Project.");
  }
  const discovery = { workspaces: connection.displayMetadata?.workspaces ?? [] };
  const resource = flattenRailwayServices(discovery).find(
    (candidate) => candidate.externalId === externalId,
  );
  if (!resource) throw new Error("The selected Railway service is unavailable.");

  return upsertAssociation({
    providerConnectionId: connection.id,
    projectId: project.id,
    componentId: componentId || null,
    providerResourceType: "service_environment",
    externalId: resource.externalId,
    displayName: `${resource.projectName} · ${resource.environmentName} · ${resource.serviceName}`,
    associationSource: "manual",
    enabled: true,
    affectsProjectHealth,
    metadata: resource,
  });
}

export async function removeRailwayResourceAssociation(
  associationId,
  {
    getConnection = getActiveProviderConnection,
    listAssociations = listProviderResourceAssociations,
    deleteAssociation = deleteProviderResourceAssociation,
  } = {},
) {
  const connection = await getConnection("railway");
  if (!connection) throw new Error("Railway is not connected.");
  const associations = await listAssociations(connection.id);
  const association = associations.find(({ id }) => id === associationId);
  if (!association) throw new Error("The Railway mapping is unavailable.");
  return deleteAssociation(association.id, connection.id);
}
