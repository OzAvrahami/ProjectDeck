import "server-only";

import {
  fetchGitHubProjectReadModel,
  fetchUserGitHubProjects,
  GitHubProjectsProviderError,
  resolveGitHubProjectForRepositories,
} from "../github/projects-v2.js";
import { parseGitHubRepositoryResource } from "../github/resource-identity.js";
import { observeProjectsGitHub } from "./github-observations.js";
import { attachProjectPhases } from "./phase.js";

function providerFailure(error) {
  return {
    status: "unavailable",
    error: {
      code:
        error instanceof GitHubProjectsProviderError ? error.code : "provider",
      message:
        error instanceof GitHubProjectsProviderError
          ? error.message
          : "GitHub Projects returned an unexpected provider response.",
    },
  };
}

function connectedRepositories(project) {
  return (project.githubRepositories ?? [])
    .map(parseGitHubRepositoryResource)
    .filter(Boolean);
}

export async function observeProjectPhaseEvidence(
  projects,
  {
    token = process.env.GITHUB_PROJECTS_TOKEN,
    fetchImpl = fetch,
  } = {},
) {
  const evidenceByProjectId = new Map();
  const projectsNeedingInference = projects.filter(
    (project) => !project.phaseOverride,
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
        ? { ...resolution, readModel: observed.readModel }
        : observed ?? providerFailure(),
    );
  }

  return evidenceByProjectId;
}

export async function observeProjectsWithPhase(
  projects,
  {
    githubToken = process.env.GITHUB_TOKEN,
    projectsToken = process.env.GITHUB_PROJECTS_TOKEN,
    fetchImpl = fetch,
    now = new Date(),
  } = {},
) {
  const [observedProjects, phaseEvidence] = await Promise.all([
    observeProjectsGitHub(projects, {
      token: githubToken,
      fetchImpl,
      now,
    }),
    observeProjectPhaseEvidence(projects, {
      token: projectsToken,
      fetchImpl,
    }),
  ]);

  return attachProjectPhases(observedProjects, phaseEvidence, { now });
}
