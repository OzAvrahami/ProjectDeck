import { describe, expect, it } from "vitest";

import {
  buildProjectCardViewModel,
  deriveProjectMark,
  selectContinueProject,
  filterProjectCards,
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
    expect(card.issueSummary).toBeNull();
    expect(card.releaseSummary).toBeNull();
    expect(card).not.toHaveProperty("version");
    expect(card).not.toHaveProperty("releaseState");
  });

  it("uses only scoped GitHub summaries supplied by the observation layer", () => {
    const card = buildProjectCardViewModel(
      project({
        githubSummary: {
          repositoryCount: 2,
          issues: {
            label: "3+ open issues",
            status: "partial",
            checkedRepositoryCount: 1,
          },
          releases: { compactLabel: "Desktop v0.2.0" },
        },
      }),
    );

    expect(card.issueSummary).toEqual({
      label: "3+ open issues",
      status: "partial",
      description: "1 of 2 repositories checked",
    });
    expect(card.releaseSummary).toEqual({ label: "Desktop v0.2.0" });
  });

  it("filters lifecycle and Needs Attention independently", () => {
    const cards = [
      buildProjectCardViewModel(project({ id: "active-attention", needsAttention: true })),
      buildProjectCardViewModel(project({ id: "stable", lifecycleState: "stable" })),
    ];

    expect(
      filterProjectCards(cards, {
        lifecycle: "active",
        attentionOnly: true,
      }).map(({ id }) => id),
    ).toEqual(["active-attention"]);
    expect(filterProjectCards(cards, { lifecycle: "stable" })[0].needsAttention).toBe(false);
  });

  it("uses observed Activity only as explicitly labeled recent context", () => {
    const card = buildProjectCardViewModel(
      project({
        githubSummary: {
          activity: {
            items: [
              {
                message: "Repair card hierarchy",
                committedAt: "2026-08-25T10:00:00Z",
              },
            ],
          },
        },
      }),
    );

    expect(card.recentActivity).toEqual({
      message: "Repair card hierarchy",
      committedAt: "2026-08-25T10:00:00Z",
    });
    expect(card.lastWorkedLabel).toBeNull();
  });
});
