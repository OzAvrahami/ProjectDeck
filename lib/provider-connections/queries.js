import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDatabase } from "../../db/client.js";
import {
  providerConnections,
  providerResourceAssociations,
} from "../../db/schema.js";

const SAFE_CONNECTION_COLUMNS = {
  id: providerConnections.id,
  provider: providerConnections.provider,
  providerAccountId: providerConnections.providerAccountId,
  displayName: providerConnections.displayName,
  connectionState: providerConnections.connectionState,
  grantedScopes: providerConnections.grantedScopes,
  selectedWorkspaces: providerConnections.selectedWorkspaces,
  displayMetadata: providerConnections.displayMetadata,
  lastDiscoveredAt: providerConnections.lastDiscoveredAt,
  createdAt: providerConnections.createdAt,
  updatedAt: providerConnections.updatedAt,
};

export function providerConnectionPublicView(connection) {
  if (!connection) return null;
  const {
    encryptedCredentials: _encryptedCredentials,
    ...publicConnection
  } = connection;
  return publicConnection;
}

export function listProviderConnections(provider = null) {
  const query = getDatabase()
    .select(SAFE_CONNECTION_COLUMNS)
    .from(providerConnections)
    .orderBy(asc(providerConnections.createdAt));

  return provider
    ? query.where(eq(providerConnections.provider, provider))
    : query;
}

export async function getActiveProviderConnection(provider) {
  const [connection] = await getDatabase()
    .select()
    .from(providerConnections)
    .where(
      and(
        eq(providerConnections.provider, provider),
        eq(providerConnections.connectionState, "connected"),
      ),
    )
    .limit(1);

  return connection ?? null;
}

export async function getProviderConnectionById(id) {
  const [connection] = await getDatabase()
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.id, id))
    .limit(1);

  return connection ?? null;
}

export async function upsertProviderConnection(input) {
  const [connection] = await getDatabase()
    .insert(providerConnections)
    .values({
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      displayName: input.displayName ?? null,
      connectionState: input.connectionState ?? "connected",
      grantedScopes: input.grantedScopes ?? [],
      selectedWorkspaces: input.selectedWorkspaces ?? [],
      encryptedCredentials: input.encryptedCredentials,
      displayMetadata: input.displayMetadata ?? {},
      lastDiscoveredAt: input.lastDiscoveredAt ?? null,
    })
    .onConflictDoUpdate({
      target: [
        providerConnections.provider,
        providerConnections.providerAccountId,
      ],
      set: {
        displayName: input.displayName ?? null,
        connectionState: input.connectionState ?? "connected",
        grantedScopes: input.grantedScopes ?? [],
        selectedWorkspaces: input.selectedWorkspaces ?? [],
        encryptedCredentials: input.encryptedCredentials,
        displayMetadata: input.displayMetadata ?? {},
        lastDiscoveredAt: input.lastDiscoveredAt ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return connection;
}

export async function updateProviderConnection(id, values) {
  const [connection] = await getDatabase()
    .update(providerConnections)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(providerConnections.id, id))
    .returning();

  return connection ?? null;
}

export function listProviderResourceAssociations(providerConnectionId = null) {
  const query = getDatabase()
    .select()
    .from(providerResourceAssociations)
    .orderBy(asc(providerResourceAssociations.displayName));

  return providerConnectionId
    ? query.where(
        eq(
          providerResourceAssociations.providerConnectionId,
          providerConnectionId,
        ),
      )
    : query;
}

export async function upsertProviderResourceAssociation(input) {
  const [association] = await getDatabase()
    .insert(providerResourceAssociations)
    .values(input)
    .onConflictDoUpdate({
      target: [
        providerResourceAssociations.providerConnectionId,
        providerResourceAssociations.externalId,
      ],
      set: {
        projectId: input.projectId,
        componentId: input.componentId ?? null,
        displayName: input.displayName,
        associationSource: input.associationSource,
        enabled: input.enabled ?? true,
        affectsProjectHealth: input.affectsProjectHealth ?? true,
        metadata: input.metadata ?? {},
        updatedAt: new Date(),
      },
    })
    .returning();

  return association;
}

export async function updateProviderResourceAssociation(id, projectId, values) {
  const [association] = await getDatabase()
    .update(providerResourceAssociations)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(
        eq(providerResourceAssociations.id, id),
        eq(providerResourceAssociations.projectId, projectId),
      ),
    )
    .returning();

  return association ?? null;
}
