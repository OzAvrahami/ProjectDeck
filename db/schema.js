import {
  boolean,
  index,
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

export const projectLifecycle = pgEnum(
  "project_lifecycle",
  PROJECT_LIFECYCLE_STATES,
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
