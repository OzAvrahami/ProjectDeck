import { describe, expect, it } from "vitest";

import {
  buildProjectCardViewModel,
  buildProjectNextPresentation,
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
    phaseOverride: null,
    phase: {
      phase: "development",
      label: "Development",
      source: "inferred",
      reason: "1 issue In Progress",
    },
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
  it("counts synthesized phase and attention independently", () => {
    const summary = summarizePortfolio([
      project({ needsAttention: true }),
      project({
        id: "maintenance",
        phase: {
          phase: "maintenance",
          label: "Maintenance",
          source: "inferred",
          reason: "published release exists, no active implementation",
        },
      }),
    ]);

    expect(summary).toEqual({
      projectCount: 2,
      developmentCount: 1,
      attentionCount: 1,
      label: "2 projects · 1 in development · 1 needs attention",
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
    expect(card.editHref).toBe("/projects/limitpact/edit");
    expect(card.components).toEqual([]);
    expect(card.hasLastWork).toBe(false);
    expect(card.issueSummary).toBeNull();
    expect(card.releaseSummary).toBeNull();
    expect(card.phase).toBe("development");
    expect(card.phaseSource).toBe("inferred");
    expect(card).not.toHaveProperty("version");
    expect(card).not.toHaveProperty("releaseState");
    expect(buildProjectNextPresentation(card)).toEqual({
      isSet: false,
      label: "No next action set",
      editHref: "/projects/limitpact/edit",
    });
  });

  it("keeps a populated Next action as explicit ProjectDeck-owned intent", () => {
    const card = buildProjectCardViewModel(
      project({ nextAction: "  Review notification preferences  " }),
    );

    expect(card.nextAction).toBe("Review notification preferences");
    expect(card.editHref).toBe("/projects/limitpact/edit");
    expect(buildProjectNextPresentation(card)).toEqual({
      isSet: true,
      label: "Review notification preferences",
      editHref: null,
    });
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

  it("filters phase and Needs Attention independently", () => {
    const cards = [
      buildProjectCardViewModel(project({ id: "development-attention", needsAttention: true })),
      buildProjectCardViewModel(project({
        id: "maintenance",
        phase: {
          phase: "maintenance",
          label: "Maintenance",
          source: "inferred",
          reason: "published release exists",
        },
      })),
    ];

    expect(
      filterProjectCards(cards, {
        phase: "development",
        attentionOnly: true,
      }).map(({ id }) => id),
    ).toEqual(["development-attention"]);
    expect(filterProjectCards(cards, { phase: "maintenance" })[0].needsAttention).toBe(false);
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
