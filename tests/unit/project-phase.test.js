import { describe, expect, it } from "vitest";

import { inferProjectPhase } from "../../lib/projects/phase.js";

function repository({
  name = "OzAvrahami/projectdeck",
  component = null,
  maturity = "implemented",
  activity = "inactive",
} = {}) {
  return {
    repository: { fullName: name },
    component: component ? { name: component } : null,
    maturity: { state: maturity, reason: `${maturity} evidence` },
    activity: { state: activity, reason: `${activity} evidence` },
  };
}

function implementation(repositories, status = "complete") {
  return { status, repositories };
}

function infer(repositories, overrides = {}) {
  return inferProjectPhase({
    override: null,
    implementation: implementation(repositories),
    ...overrides,
  });
}

describe("automatic Project phase", () => {
  it.each(["development", "paused", "archived"])(
    "lets a manual %s override win over provider evidence",
    (override) => {
      expect(
        inferProjectPhase({
          override,
          implementation: { status: "unavailable", repositories: [] },
        }),
      ).toMatchObject({ phase: override, source: "override" });
    },
  );

  it.each(["Ready", "In Progress", "Verify"])(
    "does not let %s work-item Status cause Development",
    (status) => {
      expect(
        infer([repository({ maturity: "not_started" })], {
          projectResolution: { items: [{ status }] },
        }).phase,
      ).toBe("planning");
    },
  );

  it("does not let Backlog independently establish Planning", () => {
    expect(
      infer([repository({ maturity: "unknown" })], {
        projectResolution: { items: [{ status: "Backlog" }] },
      }).phase,
    ).toBe("unknown");
  });

  it("never uses Priority for Phase", () => {
    expect(
      infer([repository({ maturity: "not_started" })], {
        projectResolution: {
          items: [{ status: "Ready", priority: "P0 — Critical" }],
        },
      }).phase,
    ).toBe("planning");
  });

  it("infers without GitHub Project resolution", () => {
    expect(
      inferProjectPhase({
        implementation: implementation([repository()]),
        projectResolution: { status: "unresolved" },
      }).phase,
    ).toBe("development");
  });

  it("infers Planning when implementation conclusively has not begun", () => {
    expect(infer([repository({ maturity: "not_started" })])).toMatchObject({
      phase: "planning",
      reason: "implementation has not begun",
    });
  });

  it.each(["Ready", "In Progress"])(
    "keeps a planning repository in Planning with a %s planning item",
    (status) => {
      expect(
        infer([repository({ maturity: "not_started" })], {
          projectResolution: { items: [{ status }] },
        }).phase,
      ).toBe("planning");
    },
  );

  it("keeps an unreleased implemented repository in Development without recent activity", () => {
    expect(infer([repository()])).toMatchObject({
      phase: "development",
      reason: "unreleased implementation exists",
    });
  });

  it("infers Maintenance from a published Release with inactive implementation", () => {
    expect(
      infer([repository({ maturity: "released", activity: "inactive" })]),
    ).toMatchObject({
      phase: "maintenance",
      reason: "released product with no recent implementation activity",
    });
  });

  it("returns a released product to Development for real implementation activity", () => {
    expect(
      infer([repository({ maturity: "released", activity: "active" })]),
    ).toMatchObject({
      phase: "development",
      reason: "released product has recent implementation activity",
    });
  });

  it("keeps a released inactive product in Maintenance despite a Ready Issue", () => {
    expect(
      infer([repository({ maturity: "released", activity: "inactive" })], {
        projectResolution: { items: [{ status: "Ready" }] },
      }).phase,
    ).toBe("maintenance");
  });

  it("returns Unknown when repository evidence is unavailable", () => {
    expect(
      inferProjectPhase({
        implementation: {
          status: "unavailable",
          repositories: [],
          failures: [{ code: "provider" }],
        },
      }),
    ).toMatchObject({ phase: "unknown", source: "unknown" });
  });

  it("does not consume Operational Health", () => {
    expect(
      inferProjectPhase({
        implementation: implementation([repository()]),
        health: { status: "down" },
      }).phase,
    ).toBe("development");
  });

  it("synthesizes multi-repository implementation as Development", () => {
    expect(
      infer([
        repository({
          name: "OzAvrahami/limitpact-desktop",
          component: "Desktop",
          maturity: "released",
        }),
        repository({
          name: "OzAvrahami/limitpact-website",
          component: "Website",
          maturity: "implemented",
        }),
      ]).phase,
    ).toBe("development");
  });

  it("lets active implementation in one released component select Development", () => {
    expect(
      infer([
        repository({ maturity: "released", activity: "inactive" }),
        repository({
          name: "OzAvrahami/other",
          maturity: "released",
          activity: "active",
        }),
      ]).phase,
    ).toBe("development");
  });

  it("treats all released inactive components as Maintenance", () => {
    expect(
      infer([
        repository({ maturity: "released", activity: "inactive" }),
        repository({
          name: "OzAvrahami/other",
          maturity: "released",
          activity: "inactive",
        }),
      ]).phase,
    ).toBe("maintenance");
  });

  it("handles material unresolved multi-repository evidence conservatively", () => {
    expect(
      infer([
        repository({ maturity: "released", activity: "inactive" }),
        repository({ name: "OzAvrahami/private", maturity: "unknown" }),
      ]).phase,
    ).toBe("unknown");
  });

  it("does not infer Planning from contradictory not-started activity", () => {
    expect(
      infer([
        repository({ maturity: "not_started", activity: "active" }),
      ]).phase,
    ).toBe("unknown");
  });

  it("never infers Paused or Archived from inactivity", () => {
    const result = infer([
      repository({ maturity: "released", activity: "inactive" }),
    ]);

    expect(result.phase).toBe("maintenance");
    expect(result.phase).not.toBe("paused");
    expect(result.phase).not.toBe("archived");
  });

  it("keeps the CeliTrip regression fixture out of Development", () => {
    expect(
      infer([repository({
        name: "OzAvrahami/CeliTrip",
        maturity: "not_started",
        activity: "inactive",
      })], {
        projectResolution: {
          items: [
            { status: "Ready", priority: "P1 — High" },
            { status: "Backlog", priority: "P1 — High" },
          ],
        },
      }).phase,
    ).toBe("planning");
  });
});
