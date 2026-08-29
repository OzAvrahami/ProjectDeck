import { describe, expect, it } from "vitest";

import {
  inferProjectNextAction,
  NEXT_PRIORITY_PRECEDENCE,
  NEXT_STATUS_PRECEDENCE,
} from "../../lib/projects/next-action.js";

function item(overrides = {}) {
  return {
    type: "issue",
    id: "issue-id",
    itemId: "item-id",
    repositoryId: "R_projectdeck",
    repositoryDatabaseId: "123",
    repository: "OzAvrahami/ProjectDeck",
    number: 2,
    title: "Automatically determine the next action",
    state: "open",
    updatedAt: "2026-08-29T10:00:00Z",
    url: "https://github.com/OzAvrahami/ProjectDeck/issues/2",
    status: "Ready",
    priority: "P1 — High",
    ...overrides,
  };
}

function resolved(items = [], overrides = {}) {
  return {
    status: "resolved",
    readModel: {
      id: "project-v2-id",
      title: "ProjectDeck Development",
      url: "https://github.com/users/OzAvrahami/projects/3",
      partial: false,
      statusField: {
        standard: true,
        options: ["Backlog", "Ready", "In Progress", "Verify", "Done"],
      },
      priorityField: {
        standard: true,
        options: NEXT_PRIORITY_PRECEDENCE,
      },
      items,
      ...overrides,
    },
  };
}

function project(overrides = {}) {
  return {
    id: "project-id",
    githubRepositories: [
      {
        id: "resource-id",
        provider: "github",
        resourceType: "repository",
        externalId: "123",
        url: "https://github.com/OzAvrahami/ProjectDeck",
        componentId: null,
        componentName: null,
      },
    ],
    ...overrides,
  };
}

function infer(items, overrides = {}) {
  return inferProjectNextAction({
    manualOverride: null,
    projectResolution: resolved(items),
    project: project(),
    ...overrides,
  });
}

describe("automatic Project Next", () => {
  it("keeps the documented Status and Priority precedence explicit", () => {
    expect(NEXT_STATUS_PRECEDENCE).toEqual(["In Progress", "Verify", "Ready"]);
    expect(NEXT_PRIORITY_PRECEDENCE).toEqual([
      "P0 — Critical",
      "P1 — High",
      "P2 — Medium",
      "P3 — Low",
    ]);
  });

  it("lets a manual override win over every automatic candidate", () => {
    expect(
      inferProjectNextAction({
        manualOverride: "Prepare App Store submission",
        projectResolution: resolved([item({ status: "In Progress", priority: "P0 — Critical" })]),
        project: project(),
      }),
    ).toMatchObject({
      action: "Prepare App Store submission",
      source: "manual",
      reason: "Manual override",
    });
  });

  it("ranks In Progress ahead of Verify", () => {
    expect(infer([
      item({ id: "verify", number: 3, status: "Verify", priority: "P0 — Critical" }),
      item({ id: "progress", number: 4, status: "In Progress", priority: "P3 — Low" }),
    ]).issueNumber).toBe(4);
  });

  it("ranks Verify ahead of Ready", () => {
    expect(infer([
      item({ id: "ready", number: 3, status: "Ready", priority: "P0 — Critical" }),
      item({ id: "verify", number: 4, status: "Verify", priority: "P3 — Low" }),
    ]).issueNumber).toBe(4);
  });

  it("keeps In Progress P3 ahead of Ready P0", () => {
    expect(infer([
      item({ id: "ready", number: 3, status: "Ready", priority: "P0 — Critical" }),
      item({ id: "progress", number: 4, status: "In Progress", priority: "P3 — Low" }),
    ]).issueNumber).toBe(4);
  });

  it("ranks P0 ahead of P1 within In Progress", () => {
    expect(infer([
      item({ id: "p1", number: 3, status: "In Progress", priority: "P1 — High" }),
      item({ id: "p0", number: 4, status: "In Progress", priority: "P0 — Critical" }),
    ]).issueNumber).toBe(4);
  });

  it("ranks P1 ahead of P2 within Ready", () => {
    expect(infer([
      item({ id: "p2", number: 3, priority: "P2 — Medium" }),
      item({ id: "p1", number: 4, priority: "P1 — High" }),
    ]).issueNumber).toBe(4);
  });

  it("ranks unset Priority after P3", () => {
    expect(infer([
      item({ id: "unset", number: 3, priority: null }),
      item({ id: "p3", number: 4, priority: "P3 — Low" }),
    ]).issueNumber).toBe(4);
  });

  it("ranks nonstandard Priority after unset Priority", () => {
    expect(infer([
      item({ id: "custom", number: 3, priority: "Urgent" }),
      item({ id: "unset", number: 4, priority: null }),
    ]).issueNumber).toBe(4);
  });

  it.each(["Backlog", "Done"])("never selects %s", (status) => {
    expect(infer([item({ status })])).toMatchObject({
      source: "none",
      action: null,
    });
  });

  it("never selects a closed Issue", () => {
    expect(infer([item({ state: "closed", status: "In Progress" })]).source).toBe("none");
  });

  it("never selects a Pull Request", () => {
    expect(infer([item({ type: "pull_request", status: "In Progress" })]).source).toBe("none");
  });

  it("returns No clear next action when there are no eligible items", () => {
    expect(infer([])).toMatchObject({
      source: "none",
      action: null,
      reason: "No open Issues in In Progress, Verify, or Ready",
    });
  });

  it.each([
    ["provider unavailable", { status: "unavailable", error: { code: "provider_failed" } }, "GitHub Projects provider is unavailable"],
    ["unresolved", { status: "unresolved", reason: "no_match" }, "GitHub Project could not be resolved"],
    ["ambiguous", { status: "ambiguous", candidates: [{ id: "one", title: "One" }, { id: "two", title: "Two" }] }, "Multiple matching GitHub Projects found"],
  ])("keeps %s distinct from no-clear-next", (_label, projectResolution, reason) => {
    expect(
      inferProjectNextAction({ manualOverride: null, projectResolution, project: project() }),
    ).toMatchObject({ source: "unavailable", action: null, reason });
  });

  it("rejects partial evidence instead of ranking an incomplete candidate set", () => {
    expect(
      inferProjectNextAction({
        manualOverride: null,
        projectResolution: resolved([item()], { partial: true }),
        project: project(),
      }),
    ).toMatchObject({ source: "unavailable", reason: "GitHub Project evidence is incomplete" });
  });

  it("does not silently treat a nonstandard Status workflow as Ready", () => {
    expect(
      inferProjectNextAction({
        manualOverride: null,
        projectResolution: resolved([item()], { statusField: { standard: false, options: ["Todo"] } }),
        project: project(),
      }),
    ).toMatchObject({ source: "unavailable", reason: "GitHub Project Status workflow is nonstandard" });
  });

  it("uses Issue update time before stable fallbacks for equal Status and Priority", () => {
    expect(infer([
      item({ id: "older", number: 3, updatedAt: "2026-08-28T10:00:00Z" }),
      item({ id: "newer", number: 4, updatedAt: "2026-08-29T10:00:00Z" }),
    ]).issueNumber).toBe(4);
  });

  it("uses repository identity then Issue number as stable tie breakers", () => {
    const result = infer([
      item({ id: "z", number: 1, repositoryDatabaseId: null, repository: "owner/zeta" }),
      item({ id: "a-high", number: 8, repositoryDatabaseId: null, repository: "owner/alpha" }),
      item({ id: "a-low", number: 3, repositoryDatabaseId: null, repository: "owner/alpha" }),
    ]);

    expect(result.issueNumber).toBe(3);
    expect(result.evidence.tieBreaker).toContain("Issue updated time descending");
  });

  it("preserves repository and component identity for a multi-repository Product", () => {
    const multiProject = project({
      githubRepositories: [
        {
          id: "desktop-resource",
          provider: "github",
          resourceType: "repository",
          externalId: "10",
          url: "https://github.com/OzAvrahami/limitpact-desktop",
          componentId: "desktop-component",
          componentName: "Desktop",
        },
        {
          id: "website-resource",
          provider: "github",
          resourceType: "repository",
          externalId: "11",
          url: "https://github.com/OzAvrahami/limitpact-website",
          componentId: "website-component",
          componentName: "Website",
        },
      ],
    });
    const result = inferProjectNextAction({
      manualOverride: null,
      projectResolution: resolved([
        item({
          repositoryDatabaseId: "10",
          repository: "OzAvrahami/limitpact-desktop",
          number: 14,
          title: "Fix installer upgrade handling",
          status: "In Progress",
        }),
      ]),
      project: multiProject,
    });

    expect(result).toMatchObject({
      source: "inferred",
      issueNumber: 14,
      repository: { databaseId: "10", fullName: "OzAvrahami/limitpact-desktop" },
      component: { id: "desktop-component", name: "Desktop" },
      contextLabel: "Desktop",
    });
  });

  it("allows active work in one component to become the Product Next", () => {
    const result = infer([
      item({ repository: "owner/desktop", number: 14, status: "Ready" }),
      item({ repository: "owner/website", number: 8, status: "Backlog" }),
    ]);

    expect(result).toMatchObject({ source: "inferred", issueNumber: 14 });
  });

  it("treats an empty manual override as Automatic", () => {
    expect(
      inferProjectNextAction({
        manualOverride: "   ",
        projectResolution: resolved([item()]),
        project: project(),
      }),
    ).toMatchObject({ source: "inferred", issueNumber: 2 });
  });
});
