import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const panelSource = readFileSync(
  path.join(root, "components/github/development-standard-panel.js"),
  "utf8",
);
const workspaceSource = readFileSync(
  path.join(root, "components/workspace/project-workspace.js"),
  "utf8",
);
const actionSource = readFileSync(
  path.join(root, "app/projects/[slug]/actions.js"),
  "utf8",
);

describe("GitHub Development Standard Workspace boundary", () => {
  it("integrates the audit into the connected Project Workspace", () => {
    expect(workspaceSource).toContain("GitHub Development Standard");
    expect(workspaceSource).toContain("GitHubDevelopmentStandardPanel");
    expect(panelSource).toContain("Audit differences and migration plan");
    expect(panelSource).toContain("Apply approved safe changes");
  });

  it("submits only Project identity and a server-generated fingerprint", () => {
    expect(panelSource).toContain('name="slug"');
    expect(panelSource).toContain('name="fingerprint"');
    expect(panelSource).not.toContain('name="action"');
    expect(panelSource).not.toContain('name="target"');
    expect(actionSource).toContain('field(formData, "fingerprint")');
    expect(actionSource).not.toContain('field(formData, "action")');
  });

  it("never accesses or transports the dedicated credential from client code", () => {
    expect(panelSource).not.toContain("process.env");
    expect(panelSource).not.toContain("Authorization");
    expect(panelSource).not.toContain("writeToken");
    expect(panelSource).not.toContain("token=");
  });

  it("communicates write capability per proposed action", () => {
    expect(panelSource).toContain('projects: "Projects write"');
    expect(panelSource).toContain('repository: "Repository-label write"');
    expect(panelSource).toContain("step.capabilityAvailable");
    expect(panelSource).toContain("plan.summary.executable");
    expect(panelSource).toContain("plan.summary.unavailable");
  });

  it("requires an explicit acknowledgement before Apply", () => {
    expect(panelSource).toContain('type="checkbox" required');
    expect(panelSource).toContain("will modify GitHub");
  });
});
