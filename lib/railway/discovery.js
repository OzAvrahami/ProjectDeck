import "server-only";

import { railwayGraphQL, RailwayProviderError } from "./index.js";

export const RAILWAY_DISCOVERY_CONCURRENCY = 6;

const WORKSPACES_QUERY = `
  query AuthorizedRailwayWorkspaces {
    me {
      id
      name
      workspaces { id name }
    }
  }
`;

const WORKSPACE_PROJECTS_QUERY = `
  query RailwayWorkspaceProjects($workspaceId: String!) {
    projects(workspaceId: $workspaceId) {
      edges { node { id name } }
    }
  }
`;

const PROJECT_DETAIL_QUERY = `
  query RailwayProjectDiscovery($id: String!) {
    project(id: $id) {
      id
      name
      environments { edges { node { id name } } }
      services {
        edges {
          node {
            id
            name
            source { repo }
          }
        }
      }
    }
  }
`;

const PROJECT_DETAIL_FALLBACK_QUERY = `
  query RailwayProjectDiscovery($id: String!) {
    project(id: $id) {
      id
      name
      environments { edges { node { id name } } }
      services { edges { node { id name } } }
    }
  }
`;

function edges(connection) {
  return connection?.edges?.map(({ node }) => node).filter(Boolean) ?? [];
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current]);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      () => worker(),
    ),
  );
  return results;
}

export function normalizeRailwayRepositoryIdentity(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");
  return /^[^/]+\/[^/]+$/.test(normalized) ? normalized.toLowerCase() : null;
}

export function railwayDiscoveredResourceExternalId({
  workspaceId,
  projectId,
  environmentId,
  serviceId,
}) {
  return [workspaceId, projectId, environmentId, serviceId].join(":");
}

export function selectProductionEnvironment(environments = []) {
  const production = environments.filter(
    ({ name }) => String(name).trim().toLowerCase() === "production",
  );
  if (production.length === 1) {
    return { status: "selected", environment: production[0] };
  }
  return {
    status: production.length > 1 ? "ambiguous" : "unresolved",
    environment: null,
  };
}

export function normalizeRailwayProject(
  project,
  { workspaceId, workspaceName },
) {
  const environments = edges(project.environments).map((environment) => ({
    id: environment.id,
    name: environment.name,
  }));
  const services = edges(project.services).map((service) => ({
    id: service.id,
    name: service.name,
    sourceRepository: normalizeRailwayRepositoryIdentity(
      service.source?.repo ?? service.repo,
    ),
  }));

  return {
    id: project.id,
    name: project.name,
    workspaceId,
    workspaceName,
    environments,
    services,
  };
}

export function flattenRailwayServices(discovery) {
  return discovery.workspaces.flatMap((workspace) =>
    workspace.projects.flatMap((project) => {
      const production = selectProductionEnvironment(project.environments);
      return project.services.flatMap((service) =>
        project.environments.map((environment) => ({
          externalId: railwayDiscoveredResourceExternalId({
            workspaceId: workspace.id,
            projectId: project.id,
            environmentId: environment.id,
            serviceId: service.id,
          }),
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          projectId: project.id,
          projectName: project.name,
          environmentId: environment.id,
          environmentName: environment.name,
          serviceId: service.id,
          serviceName: service.name,
          sourceRepository: service.sourceRepository,
          isDeterministicProduction:
            production.status === "selected" &&
            production.environment.id === environment.id,
        })),
      );
    }),
  );
}

export async function discoverRailwayResources(
  accessToken,
  { fetchImpl = fetch } = {},
) {
  const account = await railwayGraphQL(WORKSPACES_QUERY, {}, {
    token: accessToken,
    fetchImpl,
  });
  const workspaces = account.me?.workspaces ?? [];

  const discovered = await Promise.all(
    workspaces.map(async (workspace) => {
      const projectConnection = await railwayGraphQL(
        WORKSPACE_PROJECTS_QUERY,
        { workspaceId: workspace.id },
        { token: accessToken, fetchImpl },
      );
      const projects = edges(projectConnection.projects);
      const details = await mapWithConcurrency(
        projects,
        RAILWAY_DISCOVERY_CONCURRENCY,
        async ({ id }) => {
          try {
            return await railwayGraphQL(
              PROJECT_DETAIL_QUERY,
              { id },
              { token: accessToken, fetchImpl },
            );
          } catch (error) {
            // Source repository identity is optional evidence. A schema or
            // permission limitation on that field must not discard the stable
            // project/environment/service identities we can still read.
            if (!(error instanceof RailwayProviderError)) throw error;
            return railwayGraphQL(
              PROJECT_DETAIL_FALLBACK_QUERY,
              { id },
              { token: accessToken, fetchImpl },
            );
          }
        },
      );

      return {
        id: workspace.id,
        name: workspace.name,
        projects: details
          .map(({ project }) =>
            project
              ? normalizeRailwayProject(project, {
                  workspaceId: workspace.id,
                  workspaceName: workspace.name,
                })
              : null,
          )
          .filter(Boolean),
      };
    }),
  );

  return {
    account: { id: account.me?.id ?? null, name: account.me?.name ?? null },
    workspaces: discovered,
    observedAt: new Date().toISOString(),
  };
}

export function summarizeRailwayDiscovery(discovery) {
  const projects = discovery.workspaces.flatMap(({ projects }) => projects);
  const services = projects.flatMap(({ services }) => services);
  return {
    workspaceCount: discovery.workspaces.length,
    projectCount: projects.length,
    serviceCount: services.length,
    workspaces: discovery.workspaces,
  };
}
