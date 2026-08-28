import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  PROJECT_LIFECYCLE_STATES,
  PROJECT_PHASE_OVERRIDES,
  projects,
  resources,
} from "../../db/schema.js";

describe("project schema", () => {
  it("retains legacy lifecycle while adding a nullable phase override", () => {
    expect(PROJECT_LIFECYCLE_STATES).toEqual([
      "planning",
      "active",
      "stable",
      "paused",
      "completed",
      "archived",
    ]);

    const columns = getTableColumns(projects);

    expect(columns.lifecycleState).toBeDefined();
    expect(columns.phaseOverride).toBeDefined();
    expect(columns.phaseOverride.notNull).toBe(false);
    expect(columns.needsAttention).toBeDefined();
    expect(PROJECT_LIFECYCLE_STATES).not.toContain("needs_attention");
    expect(PROJECT_PHASE_OVERRIDES).toEqual([
      "planning",
      "development",
      "maintenance",
      "paused",
      "archived",
    ]);
    expect(PROJECT_PHASE_OVERRIDES).not.toContain("unknown");
  });

  it("supports stable provider resource identity without requiring it", () => {
    const columns = getTableColumns(resources);

    expect(columns.provider).toBeDefined();
    expect(columns.externalId).toBeDefined();
    expect(columns.externalId.notNull).toBe(false);
  });
});
