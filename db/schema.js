import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
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
    healthAlertsEnabled: boolean("health_alerts_enabled").default(false).notNull(),
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

export const notificationSettings = pgTable("notification_settings", {
  id: integer("id").primaryKey().default(1),
  alertsEnabled: boolean("alerts_enabled").default(false).notNull(),
  emailEnabled: boolean("email_enabled").default(false).notNull(),
  emailRecipient: varchar("email_recipient", { length: 254 }),
  smsEnabled: boolean("sms_enabled").default(false).notNull(),
  phoneNumber: varchar("phone_number", { length: 16 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [check("notification_settings_single_owner", sql`${table.id} = 1`)]);

export const healthAlertStates = pgTable("health_alert_states", {
  alertingEnabled: boolean("alerting_enabled").default(false).notNull(),
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 24 }).notNull(),
  statusSince: timestamp("status_since", { withTimezone: true }).notNull(),
  lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull(),
});

export const healthIncidents = pgTable("health_incidents", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull(),
  recoveredAt: timestamp("recovered_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closureReason: varchar("closure_reason", { length: 40 }),
  escalatedAt: timestamp("escalated_at", { withTimezone: true }),
  initialStatus: varchar("initial_status", { length: 24 }).notNull(),
  currentStatus: varchar("current_status", { length: 24 }).notNull(),
  summary: jsonb("summary").notNull(),
}, (table) => [
  uniqueIndex("health_incidents_one_active_project").on(table.projectId).where(sql`${table.closedAt} is null`),
  index("health_incidents_opened_idx").on(table.openedAt),
]);

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  incidentId: uuid("incident_id").references(() => healthIncidents.id, { onDelete: "cascade" }),
  channel: varchar("channel", { length: 8 }).notNull(),
  notificationType: varchar("notification_type", { length: 32 }).notNull(),
  testKey: uuid("test_key"),
  status: varchar("status", { length: 24 }).default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }),
  firstAttemptedAt: timestamp("first_attempted_at", { withTimezone: true }),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  providerMessageId: varchar("provider_message_id", { length: 100 }),
  failureClassification: varchar("failure_classification", { length: 64 }),
  // Immutable request snapshot for provider idempotency. Server-only; never
  // select this column into the history/UI. Contains contact data, no tokens.
  payload: jsonb("payload").notNull(),
}, (table) => [
  uniqueIndex("notification_delivery_event_channel").on(table.incidentId, table.channel, table.notificationType),
  uniqueIndex("notification_delivery_test_key").on(table.testKey),
  index("notification_delivery_pending_idx").on(table.status, table.nextAttemptAt),
  check("notification_delivery_channel", sql`${table.channel} in ('email', 'sms')`),
  check("notification_delivery_attempts", sql`${table.attempts} between 0 and 3`),
  check("notification_delivery_event", sql`(${table.notificationType} = 'test' and ${table.incidentId} is null and ${table.testKey} is not null) or (${table.notificationType} in ('incident_opened', 'incident_escalated', 'incident_recovered') and ${table.incidentId} is not null and ${table.testKey} is null)`),
]);

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
