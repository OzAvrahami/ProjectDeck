import { describe, expect, it } from "vitest";

import { PROJECT_LIFECYCLE_STATES } from "../../db/schema.js";
import {
  PROJECT_ACCENT_OPTIONS,
  PROJECT_EDIT_LIMITS,
  validateProjectEdit,
} from "../../lib/projects/edit.js";

function validInput(overrides = {}) {
  return {
    name: "  LimitPact  ",
    tagline: "  Trading discipline platform  ",
    lifecycleState: "active",
    needsAttention: false,
    attentionSummary: "Old hidden attention text",
    nextAction: "  Review notification preferences  ",
    accent: PROJECT_ACCENT_OPTIONS[0].value,
    ...overrides,
  };
}

describe("Project edit validation", () => {
  it("accepts exactly the approved lifecycle values", () => {
    expect(PROJECT_LIFECYCLE_STATES).toEqual([
      "planning",
      "active",
      "stable",
      "paused",
      "completed",
      "archived",
    ]);

    for (const lifecycleState of PROJECT_LIFECYCLE_STATES) {
      expect(validateProjectEdit(validInput({ lifecycleState })).valid).toBe(true);
    }

    const result = validateProjectEdit(
      validInput({ lifecycleState: "needs_attention" }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.lifecycleState).toBeDefined();
  });

  it("trims Project-owned text and keeps nullable Next behavior", () => {
    const result = validateProjectEdit(validInput({ nextAction: "   " }));

    expect(result).toMatchObject({
      valid: true,
      values: {
        name: "LimitPact",
        tagline: "Trading discipline platform",
        nextAction: null,
      },
    });
  });

  it("keeps Needs Attention independent and clears inactive summaries", () => {
    const inactive = validateProjectEdit(validInput());
    const active = validateProjectEdit(
      validInput({
        needsAttention: "on",
        attentionSummary: "  Production import is currently broken  ",
      }),
    );

    expect(inactive.values).toMatchObject({
      lifecycleState: "active",
      needsAttention: false,
      attentionSummary: null,
    });
    expect(active.values).toMatchObject({
      lifecycleState: "active",
      needsAttention: true,
      attentionSummary: "Production import is currently broken",
    });
  });

  it("requires a sensible display name and validates text limits", () => {
    const missing = validateProjectEdit(validInput({ name: "  " }));
    const longName = validateProjectEdit(
      validInput({ name: "x".repeat(PROJECT_EDIT_LIMITS.name + 1) }),
    );

    expect(missing.errors.name).toBe("Project name is required.");
    expect(longName.errors.name).toContain(
      `${PROJECT_EDIT_LIMITS.name} characters or fewer`,
    );
  });

  it("does not accept or produce a slug change from a display-name edit", () => {
    const result = validateProjectEdit(
      validInput({ name: "LimitPact Next" }),
    );

    expect(result.valid).toBe(true);
    expect(result.values.name).toBe("LimitPact Next");
    expect(result.values).not.toHaveProperty("slug");
  });
});
