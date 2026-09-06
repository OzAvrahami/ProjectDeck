import { describe, expect, it, vi } from "vitest";

import { applyGitHubDevelopmentStandard } from "../../lib/github/standard/apply.js";
import {
  getGitHubStandardWriteCapabilities,
  requireGitHubStandardProjectsWriteToken,
  requireGitHubStandardRepositoryWriteToken,
} from "../../lib/github/standard/credentials.js";
import { buildGitHubStandardMigrationPlan } from "../../lib/github/standard/plan.js";
import {
  createGitHubStandardProjectsWriteClient,
  createGitHubStandardRepositoryWriteClient,
  GitHubStandardWriteError,
} from "../../lib/github/standard/write-client.js";

vi.mock("server-only", () => ({}));

function labelFinding(label = "bug") {
  return {
    id: `repository:OzAvrahami/Project:label:${label}`,
    area: "primary_type_label",
    classification: "safe_change",
    target: {
      kind: "github_repository",
      repository: { owner: "OzAvrahami", name: "Project", fullName: "OzAvrahami/Project" },
      label,
    },
    current: "Missing",
    desired: label,
    action: "create_repository_label",
    safeToAutomate: true,
    reason: "Additive canonical label.",
  };
}

function projectFinding(fieldName = "Status") {
  const options = fieldName === "Status"
    ? ["Backlog", "Ready", "In Progress", "Verify", "Done"]
    : ["P0 — Critical", "P1 — High", "P2 — Medium", "P3 — Low"];
  return {
    id: `project:field:${fieldName.toLowerCase()}`,
    area: "project_field",
    classification: "safe_change",
    target: {
      kind: "github_project_field",
      project: { id: "PV2", title: "Project Development" },
      fieldName,
    },
    current: "Missing",
    desired: options,
    action: "create_project_single_select_field",
    safeToAutomate: true,
    reason: "Additive field creation.",
  };
}

function capabilityView(capabilities = {}) {
  return {
    projects: {
      available: Boolean(capabilities.projects),
      environmentVariable: "GITHUB_STANDARD_PROJECTS_WRITE_TOKEN",
    },
    repository: {
      available: Boolean(capabilities.repository),
      environmentVariable: "GITHUB_STANDARD_REPOSITORY_WRITE_TOKEN",
    },
  };
}

function audit(findings = [], capabilities = {}) {
  const value = {
    standard: "Oz GitHub Development Standard v1",
    version: "v1",
    status: findings.length ? "differences" : "conformant",
    project: { id: "project", slug: "project", name: "Project" },
    githubProject: { id: "PV2", title: "Project Development" },
    repositories: [{
      resourceId: "repo",
      status: "available",
      repository: { owner: "OzAvrahami", name: "Project", fullName: "OzAvrahami/Project" },
      labels: [],
      latestRelease: null,
    }],
    findings,
    writeCapabilities: capabilityView(capabilities),
  };
  return { ...value, plan: buildGitHubStandardMigrationPlan(value) };
}

describe("GitHub Standard split credential boundary", () => {
  it("keeps audit and planning usable with neither token", () => {
    const environment = {
      GITHUB_TOKEN: "read",
      GITHUB_PROJECTS_TOKEN: "projects-read",
    };
    const value = audit([labelFinding(), projectFinding()]);

    expect(getGitHubStandardWriteCapabilities(environment)).toEqual({
      projects: false,
      repository: false,
    });
    expect(value.plan.safeSteps).toHaveLength(2);
    expect(value.plan.executableSteps).toHaveLength(0);
    expect(value.plan.blockedByCapabilitySteps).toHaveLength(2);
  });

  it.each([
    [{ projects: true }, ["create_project_single_select_field"]],
    [{ repository: true }, ["create_repository_label"]],
    [{ projects: true, repository: true }, [
      "create_project_single_select_field",
      "create_repository_label",
    ]],
  ])("enables only the configured capability for %o", (capabilities, actions) => {
    const plan = audit([labelFinding(), projectFinding()], capabilities).plan;

    expect(plan.executableSteps.map(({ action }) => action).sort()).toEqual(
      [...actions].sort(),
    );
    expect(plan.summary.executable).toBe(actions.length);
    expect(plan.summary.unavailable).toBe(2 - actions.length);
  });

  it("does not fall back to read credentials or across write capabilities", () => {
    const readOnly = {
      GITHUB_TOKEN: "read-token",
      GITHUB_PROJECTS_TOKEN: "projects-read-token",
    };
    expect(requireGitHubStandardProjectsWriteToken(readOnly)).toBeNull();
    expect(requireGitHubStandardRepositoryWriteToken(readOnly)).toBeNull();
    expect(requireGitHubStandardRepositoryWriteToken({
      GITHUB_STANDARD_PROJECTS_WRITE_TOKEN: "projects-write-only",
    })).toBeNull();
    expect(requireGitHubStandardProjectsWriteToken({
      GITHUB_STANDARD_REPOSITORY_WRITE_TOKEN: "repository-write-only",
    })).toBeNull();
    expect(() => createGitHubStandardRepositoryWriteClient({
      repositoryToken: null,
      projectsToken: "projects-write-only",
      fetchImpl: vi.fn(),
    })).toThrowError(expect.objectContaining({ code: "write_token_missing" }));
    expect(() => createGitHubStandardProjectsWriteClient({
      projectsToken: null,
      repositoryToken: "repository-write-only",
      fetchImpl: vi.fn(),
    })).toThrowError(expect.objectContaining({ code: "write_token_missing" }));
  });

  it("fails cleanly when no capability can execute the safe plan", async () => {
    const before = audit([labelFinding(), projectFinding()]);
    const createWriteClient = vi.fn();
    const result = await applyGitHubDevelopmentStandard({
      expectedFingerprint: before.plan.fingerprint,
      loadAudit: vi.fn().mockResolvedValue(before),
      createWriteClient,
    });

    expect(result).toMatchObject({
      status: "write_unavailable",
      application: { attempted: 0, succeeded: [], failed: [] },
    });
    expect(result.application.skipped).toHaveLength(2);
    expect(createWriteClient).not.toHaveBeenCalled();
  });

  it("rejects a stale browser fingerprint before constructing either client", async () => {
    const before = audit(
      [labelFinding(), projectFinding()],
      { projects: true, repository: true },
    );
    const createWriteClient = vi.fn();
    const result = await applyGitHubDevelopmentStandard({
      expectedFingerprint: "tampered",
      loadAudit: vi.fn().mockResolvedValue(before),
      createWriteClient,
    });

    expect(result.status).toBe("stale");
    expect(createWriteClient).not.toHaveBeenCalled();
  });

  it("executes only the available subset and re-reads provider state", async () => {
    const before = audit(
      [labelFinding(), projectFinding()],
      { repository: true },
    );
    const after = audit([projectFinding()], { repository: true });
    const loadAudit = vi.fn()
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
    const executeSafeStep = vi.fn().mockImplementation(async (step) => ({
      stepId: step.id,
      action: step.action,
      target: step.target.label,
    }));
    const createWriteClient = vi.fn((capability) => {
      expect(capability).toBe("repository");
      return { capability, executeSafeStep };
    });
    const result = await applyGitHubDevelopmentStandard({
      expectedFingerprint: before.plan.fingerprint,
      loadAudit,
      createWriteClient,
    });

    expect(result.status).toBe("partial");
    expect(result.application).toMatchObject({ attempted: 1 });
    expect(result.application.succeeded).toHaveLength(1);
    expect(result.application.skipped).toHaveLength(1);
    expect(result.application.skipped[0].capability).toBe("projects");
    expect(loadAudit).toHaveBeenCalledTimes(2);
    expect(createWriteClient).toHaveBeenCalledTimes(1);
  });

  it("reports provider failure honestly and preserves post-apply re-read", async () => {
    const before = audit(
      [labelFinding("bug"), labelFinding("feature")],
      { repository: true },
    );
    const after = audit([labelFinding("feature")], { repository: true });
    const loadAudit = vi.fn()
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
    const executeSafeStep = vi.fn().mockImplementation(async (step) => {
      if (step.target.label === "feature") {
        throw new GitHubStandardWriteError(
          "provider_failed",
          "GitHub did not create feature.",
        );
      }
      return { stepId: step.id, action: step.action, target: step.target.label };
    });
    const result = await applyGitHubDevelopmentStandard({
      expectedFingerprint: before.plan.fingerprint,
      loadAudit,
      createWriteClient: () => ({ capability: "repository", executeSafeStep }),
    });

    expect(result.status).toBe("partial");
    expect(result.application).toMatchObject({ attempted: 2 });
    expect(result.application.succeeded).toHaveLength(1);
    expect(result.application.failed).toHaveLength(1);
    expect(loadAudit).toHaveBeenCalledTimes(2);
  });

  it("prevents the repository credential from executing a Project mutation", async () => {
    const fetchImpl = vi.fn();
    const client = createGitHubStandardRepositoryWriteClient({
      repositoryToken: "repository-write-token",
      fetchImpl,
    });
    const step = audit([projectFinding()], { projects: true }).plan.safeSteps[0];

    await expect(client.executeSafeStep(step)).rejects.toMatchObject({
      code: "wrong_write_capability",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("prevents the Projects credential from executing a repository mutation", async () => {
    const fetchImpl = vi.fn();
    const client = createGitHubStandardProjectsWriteClient({
      projectsToken: "projects-write-token",
      fetchImpl,
    });
    const step = audit([labelFinding()], { repository: true }).plan.safeSteps[0];

    await expect(client.executeSafeStep(step)).rejects.toMatchObject({
      code: "wrong_write_capability",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses only the repository credential for additive label creation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("{}", { status: 201 }),
    );
    const client = createGitHubStandardRepositoryWriteClient({
      repositoryToken: "repository-write-token",
      fetchImpl,
    });
    const step = audit([labelFinding()], { repository: true }).plan.safeSteps[0];

    await client.executeSafeStep(step);
    const [url, request] = fetchImpl.mock.calls[0];
    expect(url.pathname).toBe("/repos/OzAvrahami/Project/labels");
    expect(request.headers.Authorization).toBe("Bearer repository-write-token");
    expect(JSON.parse(request.body)).toEqual({ name: "bug", color: "EDEDED" });
  });

  it("uses only the Projects credential for additive Project-field creation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        createProjectV2Field: {
          projectV2Field: { id: "field", name: "Status", options: [] },
        },
      },
    }), { status: 200 }));
    const client = createGitHubStandardProjectsWriteClient({
      projectsToken: "projects-write-token",
      fetchImpl,
    });
    const step = audit([projectFinding()], { projects: true }).plan.safeSteps[0];

    await client.executeSafeStep(step);
    const [url, request] = fetchImpl.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(url).toBe("https://api.github.com/graphql");
    expect(request.headers.Authorization).toBe("Bearer projects-write-token");
    expect(body.variables.input).toMatchObject({
      projectId: "PV2",
      dataType: "SINGLE_SELECT",
      name: "Status",
    });
    expect(body.query).not.toContain("updateProjectV2ItemFieldValue");
  });

  it("does not serialize credential material into audit/client output", () => {
    const serialized = JSON.stringify(audit(
      [labelFinding(), projectFinding()],
      { projects: true, repository: true },
    ));

    expect(serialized).not.toContain("projects-write-token");
    expect(serialized).not.toContain("repository-write-token");
    expect(serialized).not.toContain("Authorization");
  });
});
