import { describe, expect, it } from "vitest";

import {
  buildProjectCardViewModel,
  deriveProjectMark,
  selectContinueProject,
  summarizePortfolio,
} from "../../lib/projects/portfolio.js";

function project(overrides = {}) {
  return {
    id: "project-id",
    slug: "limitpact",
    name: "LimitPact",
    tagline: "Trading discipline platform",
    lifecycleState: "active",
    needsAttention: false,
    attentionSummary: null,
    nextAction: null,
    accent: "258",
    lastWorkedAt: null,
    lastMeaningfulWorkSummary: null,
    components: [],
    ...overrides,
  };
}

describe("Portfolio view model", () => {
  it("counts lifecycle and attention independently", () => {
    const summary = summarizePortfolio([
      project({ needsAttention: true }),
      project({ id: "stable", lifecycleState: "stable" }),
    ]);

    expect(summary).toEqual({
      projectCount: 2,
      activeCount: 1,
      attentionCount: 1,
      label: "2 projects · 1 active · 1 needs attention",
    });
  });

  it("derives deterministic marks from names", () => {
    expect(deriveProjectMark("LimitPact")).toBe("LP");
    expect(deriveProjectMark("Finance Tracker")).toBe("FT");
    expect(deriveProjectMark("Panda")).toBe("PA");
  });

  it("selects Continue only from the newest valid last-worked context", () => {
    const older = project({
      id: "older",
      lastWorkedAt: new Date("2026-08-01T10:00:00Z"),
    });
    const newer = project({
      id: "newer",
      lastWorkedAt: new Date("2026-08-20T10:00:00Z"),
    });

    expect(selectContinueProject([older, newer])?.id).toBe("newer");
    expect(
      selectContinueProject([
        project(),
        project({ id: "invalid", lastWorkedAt: "not-a-date" }),
      ]),
    ).toBeNull();
  });

  it("keeps missing card data truthful and uncluttered", () => {
    const card = buildProjectCardViewModel(project(), new Date("2026-08-25"));

    expect(card.nextAction).toBeNull();
    expect(card.components).toEqual([]);
    expect(card.hasLastWork).toBe(false);
    expect(card).not.toHaveProperty("issueCount");
    expect(card).not.toHaveProperty("version");
    expect(card).not.toHaveProperty("releaseState");
  });
});
