import "server-only";

import {
  fetchGitHubProjectReadModel,
  fetchUserGitHubProjects,
  GitHubProjectsProviderError,
  resolveGitHubProjectForRepositories,
} from "../github/projects-v2.js";
import { parseGitHubRepositoryResource } from "../github/resource-identity.js";
import { observeProjectsGitHub } from "./github-observations.js";
import { observeProjectsHealth } from "./health-observations.js";
import { attachProjectNextActions } from "./next-action.js";
import { attachProjectPhases } from "./phase.js";

function providerFailure(error) {
  return {
    status: "unavailable",
    error: {
      code:
        error instanceof GitHubProjectsProviderError
          ? error.code
          : "provider_failed",
      message:
        error instanceof GitHubProjectsProviderError
          ? error.message
          : "GitHub Projects returned an unexpected provider response.",
    },
  };
}

function connectedRepositories(project) {
  return (project.githubRepositories ?? [])
    .map((resource) => {
      const repository = parseGitHubRepositoryResource(resource);

      return repository
        ? { ...repository, externalId: resource.externalId ?? null }
        : null;
    })
    .filter(Boolean);
}

export async function observeProjectWorkflowEvidence(
  projects,
  {
    token = process.env.GITHUB_PROJECTS_TOKEN,
    fetchImpl = fetch,
  } = {},
) {
  const evidenceByProjectId = new Map();
  const projectsNeedingInference = projects.filter(
    (project) => !project.nextAction?.trim(),
  );

  if (projectsNeedingInference.length === 0) {
    return evidenceByProjectId;
  }

  let githubProjects;

  try {
    githubProjects = await fetchUserGitHubProjects({ token, fetchImpl });
  } catch (error) {
    const failure = providerFailure(error);

    for (const project of projectsNeedingInference) {
      evidenceByProjectId.set(project.id, failure);
    }

    return evidenceByProjectId;
  }

  const resolutions = projectsNeedingInference.map((project) => ({
    project,
    resolution: resolveGitHubProjectForRepositories(
      connectedRepositories(project),
      githubProjects,
    ),
  }));
  const resolvedProjects = new Map();

  for (const { resolution } of resolutions) {
    if (resolution.status === "resolved") {
      resolvedProjects.set(resolution.project.id, resolution.project);
    }
  }

  const readModels = new Map(
    await Promise.all(
      [...resolvedProjects.values()].map(async (githubProject) => {
        try {
          return [
            githubProject.id,
            {
              status: "success",
              readModel: await fetchGitHubProjectReadModel(githubProject, {
                token,
                fetchImpl,
              }),
            },
          ];
        } catch (error) {
          return [githubProject.id, providerFailure(error)];
        }
      }),
    ),
  );

  for (const { project, resolution } of resolutions) {
    if (resolution.status !== "resolved") {
      evidenceByProjectId.set(project.id, resolution);
      continue;
    }

    const observed = readModels.get(resolution.project.id);

    evidenceByProjectId.set(
      project.id,
      observed?.status === "success"
        ? {
            ...resolution,
            evidenceStatus: !observed.readModel.statusField.standard
              ? "nonstandard_project"
              : observed.readModel.partial ||
                  resolution.repositoryVisibility === "partial"
                ? "partial"
                : "available",
            readModel: observed.readModel,
          }
        : observed ?? providerFailure(),
    );
  }

  return evidenceByProjectId;
}

export async function observeProjectsWithAutomation(
  projects,
  {
    githubToken = process.env.GITHUB_TOKEN,
    projectsToken = process.env.GITHUB_PROJECTS_TOKEN,
    fetchImpl = fetch,
    now = new Date(),
    railwayToken = process.env.RAILWAY_TOKEN,
    vercelToken = process.env.VERCEL_TOKEN,
    health = {},
  } = {},
) {
  const [observedProjects, workflowEvidence, healthProjects] = await Promise.all([
    observeProjectsGitHub(projects, {
      token: githubToken,
      fetchImpl,
      now,
    }),
    observeProjectWorkflowEvidence(projects, {
      token: projectsToken,
      fetchImpl,
    }),
    observeProjectsHealth(projects, {
      railwayToken,
      vercelToken,
      fetchImpl,
      ...health,
    }),
  ]);
  const healthByProjectId = new Map(
    healthProjects.map((project) => [project.id, project.health]),
  );
  const observedWithHealth = observedProjects.map((project) => ({
    ...project,
    health: healthByProjectId.get(project.id),
  }));

  const projectsWithPhase = attachProjectPhases(observedWithHealth);

  return attachProjectNextActions(projectsWithPhase, workflowEvidence);
}

// Kept as a compatibility export while Phase and Next share one workflow read.
export const observeProjectPhaseEvidence = observeProjectWorkflowEvidence;
export const observeProjectsWithPhase = observeProjectsWithAutomation;
