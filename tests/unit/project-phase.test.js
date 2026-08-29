import { describe, expect, it } from "vitest";

import {
  inferProjectPhase,
  RECENT_DEVELOPMENT_ACTIVITY_DAYS,
} from "../../lib/projects/phase.js";

const NOW = new Date("2026-08-28T12:00:00Z");

function item(overrides = {}) {
  return {
    id: "issue-id",
    repository: "OzAvrahami/projectdeck",
    number: 1,
    title: "Implement phase",
    state: "open",
    labels: ["feature"],
    updatedAt: "2026-08-28T10:00:00Z",
    status: "Backlog",
    priority: "P2 — Medium",
    statusRecognized: true,
    priorityRecognized: true,
    ...overrides,
  };
}

function resolved(items = [], repositories = ["OzAvrahami/projectdeck"]) {
  return {
    status: "resolved",
    readModel: {
      id: "project-id",
      title: "ProjectDeck Development",
      url: "https://github.com/users/OzAvrahami/projects/1",
      linkedRepositories: repositories,
      statusField: { standard: true, options: ["Backlog", "Ready", "In Progress", "Verify", "Done"] },
      priorityField: { standard: true, options: ["P0 — Critical", "P1 — High", "P2 — Medium", "P3 — Low"] },
      items,
    },
  };
}

function evidence(overrides = {}) {
  return {
    override: null,
    projectResolution: resolved(),
    releases: { status: "complete", items: [] },
    activity: { status: "complete", items: [] },
    ...overrides,
  };
}

function infer(overrides = {}) {
  return inferProjectPhase(evidence(overrides), { now: NOW });
}

describe("automatic Project phase", () => {
  it.each(["development", "paused", "archived"])(
    "lets a manual %s override win over provider evidence",
    (override) => {
      const result = inferProjectPhase({
        override,
        projectResolution: { status: "unavailable" },
      });

      expect(result).toMatchObject({ phase: override, source: "override" });
    },
  );

  it.each(["In Progress", "Verify", "Ready"])(
    "infers Development from an open %s issue",
    (status) => {
      expect(
        infer({ projectResolution: resolved([item({ status })]) }),
      ).toMatchObject({ phase: "development", source: "inferred" });
    },
  );

  it("does not treat Backlog alone as Development", () => {
    expect(
      infer({ projectResolution: resolved([item()]) }).phase,
    ).toBe("planning");
  });

  it("infers Maintenance from a published Release without active work", () => {
    expect(
      infer({
        projectResolution: resolved([item()]),
        releases: {
          status: "complete",
          items: [{ tagName: "v1.0.0", publishedAt: "2026-08-01T00:00:00Z" }],
        },
      }),
    ).toMatchObject({ phase: "maintenance", source: "inferred" });
  });

  it("lets active work outrank a published Release", () => {
    expect(
      infer({
        projectResolution: resolved([item({ status: "Ready" })]),
        releases: {
          status: "complete",
          items: [{ tagName: "v1.0.0" }],
        },
      }).phase,
    ).toBe("development");
  });

  it("infers Planning only from an unreleased Backlog with no recent implementation", () => {
    const result = infer({ projectResolution: resolved([item(), item({ id: "two", number: 2 })]) });

    expect(result).toMatchObject({ phase: "planning", source: "inferred" });
    expect(result.reason).toContain("2 backlog issues");
  });

  it("uses bounded meaningful activity as Development evidence for an unreleased Project", () => {
    const committedAt = new Date(
      NOW.getTime() - (RECENT_DEVELOPMENT_ACTIVITY_DAYS - 1) * 86_400_000,
    ).toISOString();

    expect(
      infer({
        activity: {
          status: "complete",
          items: [{ kind: "feat", committedAt, repository: { fullName: "OzAvrahami/projectdeck" } }],
        },
      }).phase,
    ).toBe("development");
  });

  it.each([
    {
      label: "unresolved",
      projectResolution: { status: "unresolved", reason: "no_match" },
      reason: "GitHub Project could not be resolved",
    },
    {
      label: "ambiguous",
      projectResolution: {
        status: "ambiguous",
        candidates: [
          { id: "one", title: "One" },
          { id: "two", title: "Two" },
        ],
      },
      reason: "Multiple GitHub Projects match connected repositories",
    },
    {
      label: "token missing",
      projectResolution: {
        status: "unavailable",
        error: { code: "token_missing" },
      },
      reason: "GitHub Projects token is not configured",
    },
    {
      label: "permission denied",
      projectResolution: {
        status: "unavailable",
        error: { code: "permission_denied" },
      },
      reason: "GitHub Projects access is unavailable",
    },
  ])(
    "keeps $label Project evidence distinct while returning Unknown",
    ({ projectResolution, reason }) => {
      expect(infer({ projectResolution })).toMatchObject({
        phase: "unknown",
        source: "unknown",
        reason,
      });
    },
  );

  it("returns Unknown when required provider evidence is partial", () => {
    expect(
      infer({
        projectResolution: resolved([item()]),
        releases: { status: "partial", items: [] },
      }).phase,
    ).toBe("unknown");
  });

  it("returns Unknown when an Issue has no Standard v1 Status", () => {
    expect(
      infer({
        projectResolution: resolved([
          item({ status: null, statusRecognized: false }),
        ]),
      }).phase,
    ).toBe("unknown");
  });

  it("uses visible active work even when optional Project evidence is partial", () => {
    const projectResolution = resolved([item({ status: "In Progress" })]);
    projectResolution.readModel.partial = true;
    projectResolution.readModel.priorityField = {
      standard: false,
      options: [],
    };

    expect(infer({ projectResolution }).phase).toBe("development");
  });

  it("synthesizes a multi-repository Product as Development when one component is active", () => {
    expect(
      infer({
        projectResolution: resolved(
          [item({ repository: "OzAvrahami/limitpact-website", status: "In Progress" })],
          ["OzAvrahami/limitpact-desktop", "OzAvrahami/limitpact-website"],
        ),
      }).phase,
    ).toBe("development");
  });

  it("never infers Paused or Archived from inactivity", () => {
    const result = infer({ projectResolution: resolved() });

    expect(result.phase).toBe("unknown");
    expect(result.phase).not.toBe("paused");
    expect(result.phase).not.toBe("archived");
  });
});
