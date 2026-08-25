import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  PROJECT_LIFECYCLE_STATES,
  projects,
  resources,
} from "../../db/schema.js";

describe("project schema", () => {
  it("keeps the approved lifecycle values separate from attention", () => {
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
    expect(columns.needsAttention).toBeDefined();
    expect(PROJECT_LIFECYCLE_STATES).not.toContain("needs_attention");
  });

  it("supports stable provider resource identity without requiring it", () => {
    const columns = getTableColumns(resources);

    expect(columns.provider).toBeDefined();
    expect(columns.externalId).toBeDefined();
    expect(columns.externalId.notNull).toBe(false);
  });
});
