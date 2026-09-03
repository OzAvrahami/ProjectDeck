import { describe, expect, it } from "vitest";

import {
  buildProjectCardViewModel,
  buildLatestCommitPresentation,
  buildProjectNextPresentation,
  deriveProjectMark,
  selectContinueProject,
  filterProjectCards,
  formatCompactRelativeTime,
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
      reason: "unreleased implementation exists",
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
          reason: "released product with no recent implementation activity",
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

  it("uses synthesized attention rather than only the stored manual flag", () => {
    const summary = summarizePortfolio([
      project({
        needsAttention: false,
        attention: {
          needs_attention: true,
          source: "automatic",
          severity: "high",
          primary_reason: "Latest Railway production deployment failed",
          reasons: [],
        },
      }),
      project({ id: "clear" }),
    ]);

    expect(summary.attentionCount).toBe(1);
    expect(summary.label).toContain("1 needs attention");
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
    expect(card.next.source).toBe("unavailable");
    expect(card.editHref).toBe("/projects/limitpact/edit");
    expect(card.components).toEqual([]);
    expect(card.hasLastWork).toBe(false);
    expect(card.issueSummary).toBeNull();
    expect(card.releaseSummary).toBeNull();
    expect(card.phase).toBe("development");
    expect(card.phaseSource).toBe("inferred");
    expect(card.health).toMatchObject({
      status: "not_monitored",
      label: "Not monitored",
    });
    expect(card).not.toHaveProperty("version");
    expect(card).not.toHaveProperty("releaseState");
    expect(buildProjectNextPresentation(card)).toEqual({
      isSet: false,
      label: "Unavailable",
      source: "unavailable",
      isManual: false,
      issueUrl: null,
      metaLabel: null,
      reason: "GitHub Projects provider is unavailable",
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
      source: "manual",
      isManual: true,
      issueUrl: null,
      metaLabel: null,
      reason: "Manual override",
    });
  });

  it("presents an inferred Next with compact workflow context", () => {
    const card = buildProjectCardViewModel(
      project({
        next: {
          action: "Automatically determine the next action",
          source: "inferred",
          issueNumber: 2,
          issueUrl: "https://github.com/OzAvrahami/ProjectDeck/issues/2",
          contextLabel: null,
          status: "Ready",
          priority: "P1 — High",
          reason: "Ready is the highest workflow stage available",
        },
      }),
    );

    expect(buildProjectNextPresentation(card)).toMatchObject({
      label: "Automatically determine the next action",
      source: "inferred",
      issueUrl: "https://github.com/OzAvrahami/ProjectDeck/issues/2",
      metaLabel: "#2 · P1 · Ready",
    });
  });

  it("uses only scoped GitHub summaries supplied by the observation layer", () => {
    const card = buildProjectCardViewModel(
      project({
        githubSummary: {
          repositoryCount: 2,
          issues: {
            label: "1+ bugs · 3+ open",
            bugLabel: "1+ bugs",
            openLabel: "3+ open",
            openIssueCount: 3,
            openBugCount: 1,
            status: "partial",
            checkedRepositoryCount: 1,
          },
          releases: {
            safeCardLabel: "Desktop · v0.2.0",
            state: "exact",
          },
        },
      }),
    );

    expect(card.issueSummary).toEqual({
      label: "1+ bugs · 3+ open",
      openIssueCount: 3,
      openBugCount: 1,
      status: "partial",
      segments: [
        {
          key: "bugs",
          label: "1+ bugs",
          href: "/projects/limitpact?tab=issues&type=bug",
        },
        {
          key: "open",
          label: "3+ open",
          href: "/projects/limitpact?tab=issues",
        },
      ],
      description: "1 of 2 repositories checked",
    });
    expect(card.releaseSummary).toEqual({
      label: "Desktop · v0.2.0",
      href: "/projects/limitpact?tab=releases",
      state: "exact",
      description: "Published GitHub Release evidence",
    });
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

  it("uses observed Activity as explicit Latest Commit context", () => {
    const card = buildProjectCardViewModel(
      project({
        githubSummary: {
          activity: {
            state: "exact",
            latestCommit: {
              sha: "abc1234",
              subject: "docs: Repair card hierarchy",
              message: "docs: Repair card hierarchy",
              committedAt: "2026-08-25T10:00:00Z",
              repository: {
                name: "limitpact-desktop",
                fullName: "example/limitpact-desktop",
              },
              component: null,
              url: "https://github.com/example/limitpact-desktop/commit/abc1234",
            },
            items: [
              {
                message: "docs: Repair card hierarchy",
                committedAt: "2026-08-25T10:00:00Z",
              },
            ],
          },
        },
      }),
      new Date("2026-08-25T10:00:30Z"),
    );

    expect(card.latestCommit).toMatchObject({
      state: "exact",
      visible: true,
      subject: "docs: Repair card hierarchy",
      relativeLabel: "just now",
      scopeLabel: null,
      commit: {
        sha: "abc1234",
        repositoryDisplayName: "limitpact-desktop",
      },
    });
    expect(card.lastWorkedLabel).toBeNull();
  });

  it.each([
    ["2026-09-03T11:48:00Z", "12m ago"],
    ["2026-09-03T08:00:00Z", "4h ago"],
    ["2026-08-31T12:00:00Z", "3d ago"],
    ["2026-08-13T12:00:00Z", "3w ago"],
  ])("formats %s as compact relative time", (timestamp, expected) => {
    expect(formatCompactRelativeTime(
      timestamp,
      new Date("2026-09-03T12:00:00Z"),
    )).toBe(expected);
  });

  it("marks a known multi-repository commit as partial and retains Component scope", () => {
    const presentation = buildLatestCommitPresentation(
      {
        state: "partial",
        latestCommit: {
          sha: "abc",
          subject: "fix: checkout redirect",
          committedAt: "2026-09-03T11:30:00Z",
          repository: { name: "website", fullName: "example/website" },
          component: { id: "website", name: "Website" },
          url: "https://github.com/example/website/commit/abc",
        },
      },
      2,
      new Date("2026-09-03T12:00:00Z"),
    );

    expect(presentation).toMatchObject({
      state: "partial",
      subject: "fix: checkout redirect",
      relativeLabel: "partial",
      scopeLabel: "Website",
      commit: {
        repository: { fullName: "example/website" },
        component: { name: "Website" },
      },
    });
  });

  it("falls back to a repository label for a multi-repository commit", () => {
    expect(buildLatestCommitPresentation({
      state: "exact",
      latestCommit: {
        sha: "abc",
        subject: "chore: update tooling",
        committedAt: "2026-09-03T11:00:00Z",
        repository: { name: "desktop", fullName: "example/desktop" },
        url: "https://github.com/example/desktop/commit/abc",
      },
    }, 2, new Date("2026-09-03T12:00:00Z"))).toMatchObject({
      relativeLabel: "1h ago",
      scopeLabel: "desktop",
    });
  });

  it("keeps unavailable, no repository, and no activity distinct", () => {
    expect(buildLatestCommitPresentation({ state: "unavailable" }, 1)).toMatchObject({
      visible: true,
      subject: "Latest commit unavailable",
    });
    expect(buildLatestCommitPresentation({ state: "not_connected" }, 0)).toMatchObject({
      visible: false,
      subject: "No GitHub repository",
    });
    expect(buildLatestCommitPresentation({ state: "exact", latestCommit: null }, 1)).toMatchObject({
      visible: true,
      subject: "No commit activity",
    });
  });
});
