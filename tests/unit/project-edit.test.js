import { describe, expect, it } from "vitest";

import { PROJECT_PHASE_OVERRIDES } from "../../db/schema.js";
import {
  PROJECT_ACCENT_OPTIONS,
  PROJECT_ATTENTION_MODE_OPTIONS,
  PROJECT_EDIT_LIMITS,
  validateProjectEdit,
} from "../../lib/projects/edit.js";

function validInput(overrides = {}) {
  return {
    name: "  LimitPact  ",
    tagline: "  Trading discipline platform  ",
    phaseOverride: null,
    needsAttention: false,
    attentionSummary: "Old hidden attention text",
    nextActionMode: "manual",
    nextAction: "  Review notification preferences  ",
    accent: PROJECT_ACCENT_OPTIONS[0].value,
    ...overrides,
  };
}

describe("Project edit validation", () => {
  it("accepts Automatic and exactly the approved phase overrides", () => {
    expect(PROJECT_PHASE_OVERRIDES).toEqual([
      "planning",
      "development",
      "maintenance",
      "paused",
      "archived",
    ]);

    expect(validateProjectEdit(validInput()).values.phaseOverride).toBeNull();

    for (const phaseOverride of PROJECT_PHASE_OVERRIDES) {
      expect(validateProjectEdit(validInput({ phaseOverride })).valid).toBe(true);
    }

    const result = validateProjectEdit(
      validInput({ phaseOverride: "unknown" }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.phaseOverride).toBeDefined();
  });

  it("trims Project-owned text and clears an empty manual override to Automatic", () => {
    const result = validateProjectEdit(validInput({ nextAction: "   " }));

    expect(result).toMatchObject({
      valid: true,
      values: {
        name: "LimitPact",
        tagline: "Trading discipline platform",
        nextActionMode: "automatic",
        nextAction: null,
      },
    });
  });

  it("clears a stored manual Next when Automatic is selected", () => {
    expect(
      validateProjectEdit(
        validInput({
          nextActionMode: "automatic",
          nextAction: "This value must be cleared",
        }),
      ).values,
    ).toMatchObject({ nextActionMode: "automatic", nextAction: null });
  });

  it("rejects an unknown Next action mode", () => {
    const result = validateProjectEdit(validInput({ nextActionMode: "suggested" }));

    expect(result.valid).toBe(false);
    expect(result.errors.nextActionMode).toBe("Choose Automatic or Manual override.");
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
      phaseOverride: null,
      needsAttention: false,
      attentionSummary: null,
    });
    expect(active.values).toMatchObject({
      phaseOverride: null,
      needsAttention: true,
      attentionSummary: "Production import is currently broken",
    });
  });

  it("models manual attention as Automatic or Force Needs Attention", () => {
    expect(PROJECT_ATTENTION_MODE_OPTIONS).toEqual([
      { value: "automatic", label: "Automatic" },
      { value: "force", label: "Force Needs Attention" },
    ]);

    const forced = validateProjectEdit(validInput({
      attentionMode: "force",
      attentionSummary: "  Prepare production migration  ",
    }));
    expect(forced.values).toMatchObject({
      attentionMode: "force",
      needsAttention: true,
      attentionSummary: "Prepare production migration",
    });

    const automatic = validateProjectEdit(validInput({
      attentionMode: "automatic",
      needsAttention: true,
      attentionSummary: "Clear this manual reason",
    }));
    expect(automatic.values).toMatchObject({
      attentionMode: "automatic",
      needsAttention: false,
      attentionSummary: null,
    });
  });

  it("rejects an unknown attention mode", () => {
    const result = validateProjectEdit(validInput({ attentionMode: "suppress" }));
    expect(result.valid).toBe(false);
    expect(result.errors.attentionMode).toBe(
      "Choose Automatic or Force Needs Attention.",
    );
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
