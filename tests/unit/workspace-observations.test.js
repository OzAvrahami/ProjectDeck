import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  observeProjectWorkspaceSurface,
  workspaceObservationRequirements,
} from "../../lib/projects/workspace-observations.js";

vi.mock("server-only", () => ({}));

const project = { id: "project-1", slug: "project-1" };

describe("Project Workspace observation selection", () => {
  it.each([
    ["issues", ["issues"]],
    ["releases", ["releases"]],
    ["activity", ["activity"]],
  ])("requests only %s evidence for the %s tab", async (tab, features) => {
    const observed = { ...project, githubSummary: { state: "partial" } };
    const observeGitHub = vi.fn().mockResolvedValue([observed]);
    const observeAutomation = vi.fn();

    await expect(
      observeProjectWorkspaceSurface(project, tab, {
        observeGitHub,
        observeAutomation,
      }),
    ).resolves.toBe(observed);

    expect(observeGitHub).toHaveBeenCalledOnce();
    expect(observeGitHub).toHaveBeenCalledWith([project], { features });
    expect(observeAutomation).not.toHaveBeenCalled();
  });

  it("does no provider work for the local Docs tab", async () => {
    const observeGitHub = vi.fn();
    const observeAutomation = vi.fn();

    await expect(
      observeProjectWorkspaceSurface(project, "docs", {
        observeGitHub,
        observeAutomation,
      }),
    ).resolves.toBe(project);
    expect(observeGitHub).not.toHaveBeenCalled();
    expect(observeAutomation).not.toHaveBeenCalled();
  });

  it("keeps the complete automation dependency graph on Overview", async () => {
    const observed = { ...project, phase: { phase: "development" } };
    const observeGitHub = vi.fn();
    const observeAutomation = vi.fn().mockResolvedValue([observed]);

    await expect(
      observeProjectWorkspaceSurface(project, "overview", {
        observeGitHub,
        observeAutomation,
      }),
    ).resolves.toBe(observed);
    expect(observeAutomation).toHaveBeenCalledOnce();
    expect(observeAutomation).toHaveBeenCalledWith([project]);
    expect(observeGitHub).not.toHaveBeenCalled();
  });

  it("loads Railway integration and Standard audit only on Overview", () => {
    expect(workspaceObservationRequirements("overview")).toMatchObject({
      railwayIntegration: true,
      standardAudit: true,
    });

    for (const tab of ["issues", "releases", "activity", "docs"]) {
      expect(workspaceObservationRequirements(tab)).toMatchObject({
        railwayIntegration: false,
        standardAudit: false,
      });
    }
  });
});

describe("Project Workspace route performance boundaries", () => {
  const pageSource = readFileSync(
    fileURLToPath(new URL("../../app/projects/[slug]/page.js", import.meta.url)),
    "utf8",
  );
  const actionSource = readFileSync(
    fileURLToPath(new URL("../../app/projects/[slug]/actions.js", import.meta.url)),
    "utf8",
  );
  const querySource = readFileSync(
    fileURLToPath(new URL("../../lib/projects/queries.js", import.meta.url)),
    "utf8",
  );

  it("streams local Workspace identity before provider evidence", () => {
    expect(pageSource).toContain("<ProjectWorkspaceShell");
    expect(pageSource).toContain("observedProjectPromise");
    expect(pageSource).toContain("<Suspense");
    expect(pageSource).toContain("<WorkspaceProviderLoading");
  });

  it("shares one observation promise between header and tab content", () => {
    expect(pageSource.match(/observeProjectWorkspaceSurface\(/g)).toHaveLength(1);
    expect(pageSource).toContain(
      "observedProjectPromise={observedProjectPromise}",
    );
  });

  it("loads a Workspace by exact slug rather than composing the full portfolio", () => {
    const workspaceQuery = querySource.slice(
      querySource.indexOf("export async function getProjectWorkspaceBySlug"),
      querySource.indexOf("export async function createResource"),
    );

    expect(workspaceQuery).toContain("eq(projects.slug, slug)");
    expect(workspaceQuery).not.toContain("listPortfolioProjects()");
  });

  it("does not add caching to the Standard Apply re-read boundary", () => {
    expect(actionSource).toContain("loadAudit: async () =>");
    expect(actionSource).toContain("observeGitHubDevelopmentStandard");
    expect(actionSource).not.toContain("unstable_cache");
  });
});
