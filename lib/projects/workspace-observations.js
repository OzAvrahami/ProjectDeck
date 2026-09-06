import "server-only";

import { observeProjectsGitHub } from "./github-observations.js";
import { observeProjectsWithAutomation } from "./phase-observations.js";

export const WORKSPACE_OBSERVATION_REQUIREMENTS = Object.freeze({
  overview: Object.freeze({
    mode: "automation",
    githubFeatures: Object.freeze([
      "issues",
      "releases",
      "activity",
      "implementation",
    ]),
    railwayIntegration: true,
    standardAudit: true,
  }),
  issues: Object.freeze({
    mode: "github",
    githubFeatures: Object.freeze(["issues"]),
    railwayIntegration: false,
    standardAudit: false,
  }),
  releases: Object.freeze({
    mode: "github",
    githubFeatures: Object.freeze(["releases"]),
    railwayIntegration: false,
    standardAudit: false,
  }),
  activity: Object.freeze({
    mode: "github",
    githubFeatures: Object.freeze(["activity"]),
    railwayIntegration: false,
    standardAudit: false,
  }),
  docs: Object.freeze({
    mode: "local",
    githubFeatures: Object.freeze([]),
    railwayIntegration: false,
    standardAudit: false,
  }),
});

export function workspaceObservationRequirements(activeTab) {
  return (
    WORKSPACE_OBSERVATION_REQUIREMENTS[activeTab] ??
    WORKSPACE_OBSERVATION_REQUIREMENTS.overview
  );
}

export async function observeProjectWorkspaceSurface(
  project,
  activeTab,
  {
    observeAutomation = observeProjectsWithAutomation,
    observeGitHub = observeProjectsGitHub,
  } = {},
) {
  const requirements = workspaceObservationRequirements(activeTab);

  if (requirements.mode === "local") {
    return project;
  }

  if (requirements.mode === "github") {
    const [observedProject] = await observeGitHub([project], {
      features: [...requirements.githubFeatures],
    });
    return observedProject;
  }

  const [observedProject] = await observeAutomation([project]);
  return observedProject;
}
