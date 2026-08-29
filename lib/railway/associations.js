import { parseGitHubRepositoryResource } from "../github/resource-identity.js";
import { flattenRailwayServices } from "./discovery.js";

function repositoryIdentities(project) {
  return new Set(
    (project.githubRepositories ?? [])
      .map((resource) => parseGitHubRepositoryResource(resource)?.fullName)
      .filter(Boolean)
      .map((value) => value.toLowerCase()),
  );
}

export function findAutomaticRailwayAssociations(discovery, projects) {
  const candidates = flattenRailwayServices(discovery).filter(
    (resource) =>
      resource.isDeterministicProduction && resource.sourceRepository,
  );
  const projectRepositories = projects.map((project) => ({
    project,
    repositories: repositoryIdentities(project),
  }));
  const matches = [];
  const ambiguous = [];

  for (const resource of candidates) {
    const matchedProjects = projectRepositories.filter(({ repositories }) =>
      repositories.has(resource.sourceRepository),
    );
    if (matchedProjects.length === 1) {
      matches.push({ project: matchedProjects[0].project, resource });
    } else if (matchedProjects.length > 1) {
      ambiguous.push({ resource, projectIds: matchedProjects.map(({ project }) => project.id) });
    }
  }

  return { matches, ambiguous };
}

export function unmappedRailwayResources(discovery, associations = []) {
  const mapped = new Set(associations.map(({ externalId }) => externalId));
  return flattenRailwayServices(discovery).filter(
    (resource) => !mapped.has(resource.externalId),
  );
}

