import { describe, expect, it, vi } from "vitest";

import {
  classifyImplementationChanges,
  classifyRepositoryTree,
  isMeaningfulImplementationPath,
  observeRepositoryImplementation,
  recentCommitsWithinWindow,
} from "../../lib/github/implementation.js";

vi.mock("server-only", () => ({}));

describe("GitHub implementation evidence", () => {
  it("keeps a published GitHub Release as released Phase maturity evidence", async () => {
    const result = await observeRepositoryImplementation(
      { owner: "example", name: "project", fullName: "example/project" },
      {
        release: {
          status: "success",
          item: {
            tagName: "v1.0.0",
            publishedAt: "2026-09-03T10:00:00Z",
          },
        },
        activity: {
          status: "unavailable",
          error: { code: "provider", message: "Unavailable" },
        },
      },
    );

    expect(result.maturity).toMatchObject({
      state: "released",
      evidence: {
        tagName: "v1.0.0",
        publishedAt: "2026-09-03T10:00:00Z",
      },
    });
  });

  it.each([
    "README.md",
    "docs/product.md",
    "design-reference/demo.html",
    ".github/workflows/ci.yml",
    "package-lock.json",
    "next.config.js",
    "tests/unit/example.test.js",
  ])("does not treat %s as a meaningful implementation path", (path) => {
    expect(isMeaningfulImplementationPath(path)).toBe(false);
  });

  it.each([
    "app/api/projects/route.js",
    "src/components/TripPlanner.tsx",
    "server/main.py",
    "db/migrations/001_create.sql",
  ])("recognizes the implementation path %s", (path) => {
    expect(isMeaningfulImplementationPath(path)).toBe(true);
  });

  it("classifies a documentation-only repository as not started", () => {
    expect(
      classifyRepositoryTree([
        { type: "blob", path: "README.md", size: 800 },
        { type: "blob", path: "docs/product.md", size: 4_000 },
        { type: "blob", path: ".github/release.yml", size: 300 },
      ]),
    ).toMatchObject({ state: "not_started" });
  });

  it("keeps a common framework scaffold inconclusive", () => {
    expect(
      classifyRepositoryTree([
        { type: "blob", path: "app/page.js", size: 2_000 },
        { type: "blob", path: "app/layout.js", size: 1_000 },
        { type: "blob", path: "app/globals.css", size: 2_000 },
      ]),
    ).toMatchObject({ state: "unknown" });
  });

  it("recognizes a meaningful implementation footprint", () => {
    expect(
      classifyRepositoryTree([
        { type: "blob", path: "app/page.js", size: 2_000 },
        { type: "blob", path: "lib/projects/phase.js", size: 8_000 },
      ]),
    ).toMatchObject({ state: "implemented" });
  });

  it("keeps a truncated tree without positive evidence unknown", () => {
    expect(
      classifyRepositoryTree(
        [{ type: "blob", path: "README.md", size: 800 }],
        { truncated: true },
      ),
    ).toMatchObject({ state: "unknown" });
  });

  it("keeps an unfamiliar repository file type unknown instead of assuming Planning", () => {
    expect(
      classifyRepositoryTree([
        { type: "blob", path: "analysis/product-model.ipynb", size: 10_000 },
      ]),
    ).toMatchObject({ state: "unknown" });
  });

  it("does not treat documentation-only or configuration-only changes as active", () => {
    expect(
      classifyImplementationChanges([
        { filename: "README.md" },
        { filename: "docs/product.md" },
        { filename: ".github/workflows/ci.yml" },
        { filename: "package-lock.json" },
        { filename: "next.config.js" },
      ]),
    ).toMatchObject({ state: "inactive" });
  });

  it("recognizes a source-file change without using its commit message", () => {
    expect(
      classifyImplementationChanges([
        { filename: "src/planner/trip-model.js" },
      ]),
    ).toMatchObject({ state: "active" });
  });

  it("keeps an unfamiliar changed-file type unknown", () => {
    expect(
      classifyImplementationChanges([
        { filename: "analysis/product-model.ipynb" },
      ]),
    ).toMatchObject({ state: "unknown" });
  });

  it("returns Unknown when a bounded change response has no positive evidence", () => {
    expect(
      classifyImplementationChanges([{ filename: "README.md" }], {
        historyBounded: true,
      }),
    ).toMatchObject({ state: "unknown" });
  });

  it("uses a transparent bounded recent-commit window", () => {
    const now = new Date("2026-08-29T12:00:00Z");
    const commits = [
      { sha: "recent", committedAt: "2026-08-20T12:00:00Z" },
      { sha: "old", committedAt: "2026-07-01T12:00:00Z" },
    ];

    expect(recentCommitsWithinWindow(commits, { now }).map(({ sha }) => sha))
      .toEqual(["recent"]);
  });
});
