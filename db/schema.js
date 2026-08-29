import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const PROJECT_LIFECYCLE_STATES = [
  "planning",
  "active",
  "stable",
  "paused",
  "completed",
  "archived",
];

export const PROJECT_PHASE_OVERRIDES = [
  "planning",
  "development",
  "maintenance",
  "paused",
  "archived",
];

export const projectLifecycle = pgEnum(
  "project_lifecycle",
  PROJECT_LIFECYCLE_STATES,
);

export const projectPhaseOverride = pgEnum(
  "project_phase_override",
  PROJECT_PHASE_OVERRIDES,
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    tagline: text("tagline").notNull(),
    lifecycleState: projectLifecycle("lifecycle_state")
      .default("planning")
      .notNull(),
    // Legacy lifecycle data is retained for backward compatibility. New UI
    // reads synthesized phase and uses this nullable override only on request.
    phaseOverride: projectPhaseOverride("phase_override"),
    needsAttention: boolean("needs_attention").default(false).notNull(),
    attentionSummary: text("attention_summary"),
    nextAction: text("next_action"),
    accent: varchar("accent", { length: 64 }).notNull(),
    lastWorkedAt: timestamp("last_worked_at", { withTimezone: true }),
    lastMeaningfulWorkSummary: text("last_meaningful_work_summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("projects_slug_unique").on(table.slug),
    index("projects_lifecycle_state_idx").on(table.lifecycleState),
    index("projects_last_worked_at_idx").on(table.lastWorkedAt),
  ],
);

export const components = pgTable(
  "components",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    currentVersion: varchar("current_version", { length: 100 }),
    healthStatus: text("health_status"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("components_project_id_idx").on(table.projectId)],
);

export const resources = pgTable(
  "resources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    componentId: uuid("component_id").references(() => components.id, {
      onDelete: "set null",
    }),
    resourceType: varchar("resource_type", { length: 80 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    url: text("url").notNull(),
    provider: varchar("provider", { length: 80 }),
    externalId: varchar("external_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("resources_project_id_idx").on(table.projectId),
    index("resources_component_id_idx").on(table.componentId),
    uniqueIndex("resources_provider_external_id_unique").on(
      table.provider,
      table.externalId,
    ),
  ],
);

export const resourceMonitors = pgTable(
  "resource_monitors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id").references(() => resources.id, {
      onDelete: "cascade",
    }),
    componentId: uuid("component_id").references(() => components.id, {
      onDelete: "set null",
    }),
    label: varchar("label", { length: 160 }).notNull(),
    monitorType: varchar("monitor_type", { length: 80 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    affectsProjectHealth: boolean("affects_project_health")
      .default(true)
      .notNull(),
    // Configuration is intentionally non-secret. Secret-bearing monitors store
    // only an environment-variable name, never its value.
    configuration: jsonb("configuration").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("resource_monitors_project_id_idx").on(table.projectId),
    index("resource_monitors_component_id_idx").on(table.componentId),
    uniqueIndex("resource_monitors_resource_type_unique").on(
      table.resourceId,
      table.monitorType,
    ),
  ],
);

export const providerConnections = pgTable(
  "provider_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: varchar("provider", { length: 80 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    connectionState: varchar("connection_state", { length: 40 })
      .default("connected")
      .notNull(),
    grantedScopes: jsonb("granted_scopes").default([]).notNull(),
    selectedWorkspaces: jsonb("selected_workspaces").default([]).notNull(),
    // Only an AES-256-GCM encrypted envelope is stored here. Provider tokens
    // are never stored in plaintext or mixed into display metadata.
    encryptedCredentials: jsonb("encrypted_credentials"),
    displayMetadata: jsonb("display_metadata").default({}).notNull(),
    lastDiscoveredAt: timestamp("last_discovered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("provider_connections_provider_account_unique").on(
      table.provider,
      table.providerAccountId,
    ),
    index("provider_connections_provider_state_idx").on(
      table.provider,
      table.connectionState,
    ),
  ],
);

export const providerResourceAssociations = pgTable(
  "provider_resource_associations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerConnectionId: uuid("provider_connection_id")
      .notNull()
      .references(() => providerConnections.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    componentId: uuid("component_id").references(() => components.id, {
      onDelete: "set null",
    }),
    providerResourceType: varchar("provider_resource_type", { length: 80 })
      .notNull(),
    externalId: varchar("external_id", { length: 512 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    associationSource: varchar("association_source", { length: 40 })
      .default("manual")
      .notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    affectsProjectHealth: boolean("affects_project_health")
      .default(true)
      .notNull(),
    // Stable provider IDs, names, and source repository identity only.
    // Credentials are prohibited from this non-secret metadata object.
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("provider_resource_associations_connection_external_unique").on(
      table.providerConnectionId,
      table.externalId,
    ),
    index("provider_resource_associations_project_idx").on(table.projectId),
    index("provider_resource_associations_component_idx").on(table.componentId),
  ],
);
