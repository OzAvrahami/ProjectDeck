import { findAutomaticRailwayAssociations } from "./associations.js";
import { flattenRailwayServices } from "./discovery.js";

export function defaultRailwayHealthImpact(resource) {
  return (
    String(resource?.environmentName ?? "")
      .trim()
      .toLowerCase() === "production"
  );
}

function compareResource(left, right) {
  return ["projectName", "environmentName", "serviceName"].reduce(
    (result, key) =>
      result ||
      String(left[key] ?? "").localeCompare(String(right[key] ?? "")),
    0,
  );
}

export function buildRailwayMappingsView({
  integration,
  projects,
  observations = [],
}) {
  const discovery = {
    workspaces: integration?.connection?.displayMetadata?.workspaces ?? [],
  };
  const associations = integration?.associations ?? [];
  const associationsByExternalId = new Map(
    associations.map((association) => [association.externalId, association]),
  );
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const observationsByAssociationId = new Map(
    observations.map(({ observation }) => [
      observation.monitor.id,
      observation,
    ]),
  );
  const automatic = findAutomaticRailwayAssociations(discovery, projects);
  const ambiguousIds = new Set(
    automatic.ambiguous.map(({ resource }) => resource.externalId),
  );

  const resources = flattenRailwayServices(discovery)
    .sort(compareResource)
    .map((resource) => {
      const association = associationsByExternalId.get(resource.externalId) ?? null;
      const project = association
        ? projectsById.get(association.projectId) ?? null
        : null;
      const component = association?.componentId
        ? project?.components?.find(({ id }) => id === association.componentId) ?? null
        : null;
      const observation = association
        ? observationsByAssociationId.get(association.id) ?? null
        : null;

      return {
        ...resource,
        mappingState: association
          ? association.associationSource === "automatic"
            ? "automatic"
            : "manual"
          : ambiguousIds.has(resource.externalId)
            ? "ambiguous"
            : "unmapped",
        association,
        mappedProject: project
          ? { id: project.id, name: project.name, slug: project.slug }
          : null,
        mappedComponent: component
          ? { id: component.id, name: component.name }
          : null,
        defaultAffectsProjectHealth: defaultRailwayHealthImpact(resource),
        deployment: observation
          ? {
              status: observation.status,
              reason: observation.reason,
              observedAt: observation.observedAt,
              providerStatus:
                observation.evidence?.latestDeploymentStatus ?? null,
            }
          : null,
      };
    });

  const mappedCount = resources.filter(({ association }) => association).length;
  const ambiguousCount = resources.filter(
    ({ mappingState }) => mappingState === "ambiguous",
  ).length;

  return {
    resources,
    counts: {
      mapped: mappedCount,
      unmapped: resources.length - mappedCount,
      ambiguous: ambiguousCount,
      total: resources.length,
    },
  };
}
