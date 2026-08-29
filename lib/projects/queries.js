import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, eq, isNotNull } from "drizzle-orm";

import { getDatabase } from "../../db/client.js";
import {
  components,
  providerResourceAssociations,
  projects,
  resourceMonitors,
  resources,
} from "../../db/schema.js";

export function listProjects() {
  return getDatabase().select().from(projects).orderBy(asc(projects.name));
}

export async function listPortfolioProjects() {
  const database = getDatabase();
  const [projectRows, componentRows, resourceRows, monitorRows, associationRows] = await database.batch([
    database.select().from(projects).orderBy(asc(projects.name)),
    database.select().from(components).orderBy(asc(components.name)),
    database.select().from(resources).orderBy(asc(resources.label)),
    database.select().from(resourceMonitors).orderBy(asc(resourceMonitors.label)),
    database
      .select()
      .from(providerResourceAssociations)
      .orderBy(asc(providerResourceAssociations.displayName)),
  ]);
  const componentsByProjectId = new Map();
  const componentById = new Map();
  const resourcesByProjectId = new Map();
  const resourceById = new Map();
  const monitorsByProjectId = new Map();
  const associationsByProjectId = new Map();

  for (const component of componentRows) {
    const projectComponents =
      componentsByProjectId.get(component.projectId) ?? [];
    projectComponents.push(component);
    componentsByProjectId.set(component.projectId, projectComponents);
    componentById.set(component.id, component);
  }

  for (const resource of resourceRows) {
    const projectResources = resourcesByProjectId.get(resource.projectId) ?? [];
    projectResources.push({
      ...resource,
      componentName: resource.componentId
        ? componentById.get(resource.componentId)?.name ?? null
        : null,
    });
    resourcesByProjectId.set(resource.projectId, projectResources);
    resourceById.set(resource.id, resource);
  }

  for (const monitor of monitorRows) {
    const resource = monitor.resourceId
      ? resourceById.get(monitor.resourceId) ?? null
      : null;
    const component = componentById.get(
      monitor.componentId ?? resource?.componentId,
    ) ?? null;
    const projectMonitors = monitorsByProjectId.get(monitor.projectId) ?? [];
    projectMonitors.push({ ...monitor, resource, component });
    monitorsByProjectId.set(monitor.projectId, projectMonitors);
  }

  for (const association of associationRows) {
    const projectAssociations =
      associationsByProjectId.get(association.projectId) ?? [];
    projectAssociations.push({
      ...association,
      component: association.componentId
        ? componentById.get(association.componentId) ?? null
        : null,
    });
    associationsByProjectId.set(association.projectId, projectAssociations);
  }

  return projectRows.map((project) => {
    const projectResources = resourcesByProjectId.get(project.id) ?? [];

    return {
      ...project,
      components: componentsByProjectId.get(project.id) ?? [],
      resources: projectResources,
      githubRepositories: projectResources.filter(
        (resource) =>
          resource.provider === "github" &&
          resource.resourceType === "repository",
      ),
      railwayResources: projectResources.filter(
        (resource) => resource.provider === "railway",
      ),
      healthMonitors: monitorsByProjectId.get(project.id) ?? [],
      providerAssociations: associationsByProjectId.get(project.id) ?? [],
    };
  });
}

export async function getProjectWorkspaceBySlug(slug) {
  const projectRows = await listPortfolioProjects();
  return projectRows.find((project) => project.slug === slug) ?? null;
}

export async function createResource(input) {
  const [resource] = await getDatabase()
    .insert(resources)
    .values({
      projectId: input.projectId,
      componentId: input.componentId ?? null,
      resourceType: input.resourceType,
      label: input.label,
      url: input.url,
      provider: input.provider ?? null,
      externalId: input.externalId ?? null,
    })
    .returning();

  return resource;
}

export async function createResourceMonitor(input) {
  const [monitor] = await getDatabase()
    .insert(resourceMonitors)
    .values({
      projectId: input.projectId,
      resourceId: input.resourceId ?? null,
      componentId: input.componentId ?? null,
      label: input.label,
      monitorType: input.monitorType,
      enabled: input.enabled ?? true,
      affectsProjectHealth: input.affectsProjectHealth ?? true,
      configuration: input.configuration ?? {},
    })
    .returning();

  return monitor;
}

export async function createResourceAndMonitor({ resource, monitor }) {
  const database = getDatabase();
  const resourceId = resource.id ?? randomUUID();
  const monitorId = monitor.id ?? randomUUID();

  await database.batch([
    database.insert(resources).values({
      id: resourceId,
      projectId: resource.projectId,
      componentId: resource.componentId ?? null,
      resourceType: resource.resourceType,
      label: resource.label,
      url: resource.url,
      provider: resource.provider ?? null,
      externalId: resource.externalId ?? null,
    }),
    database.insert(resourceMonitors).values({
      id: monitorId,
      projectId: monitor.projectId,
      resourceId,
      componentId: monitor.componentId ?? resource.componentId ?? null,
      label: monitor.label,
      monitorType: monitor.monitorType,
      enabled: monitor.enabled ?? true,
      affectsProjectHealth: monitor.affectsProjectHealth ?? true,
      configuration: monitor.configuration ?? {},
    }),
  ]);

  return { resourceId, monitorId };
}

export async function updateResourceMonitorState(
  monitorId,
  projectId,
  { enabled, affectsProjectHealth },
) {
  const [monitor] = await getDatabase()
    .update(resourceMonitors)
    .set({ enabled, affectsProjectHealth, updatedAt: new Date() })
    .where(
      and(
        eq(resourceMonitors.id, monitorId),
        eq(resourceMonitors.projectId, projectId),
      ),
    )
    .returning();

  return monitor ?? null;
}

export async function getProjectById(id) {
  const [project] = await getDatabase()
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  return project ?? null;
}

export async function getProjectBySlug(slug) {
  const [project] = await getDatabase()
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);

  return project ?? null;
}

export async function createProject(input) {
  const [project] = await getDatabase()
    .insert(projects)
    .values({
      slug: input.slug,
      name: input.name,
      tagline: input.tagline,
      lifecycleState: input.lifecycleState ?? "planning",
      phaseOverride: input.phaseOverride ?? null,
      needsAttention: input.needsAttention ?? false,
      attentionSummary: input.attentionSummary ?? null,
      nextAction: input.nextAction ?? null,
      accent: input.accent,
      lastWorkedAt: input.lastWorkedAt ?? null,
      lastMeaningfulWorkSummary: input.lastMeaningfulWorkSummary ?? null,
    })
    .returning();

  return project;
}

export async function updateProjectOwnedFields(projectId, input) {
  const [project] = await getDatabase()
    .update(projects)
    .set({
      name: input.name,
      tagline: input.tagline,
      phaseOverride: input.phaseOverride ?? null,
      needsAttention: input.needsAttention,
      attentionSummary: input.needsAttention
        ? input.attentionSummary ?? null
        : null,
      nextAction: input.nextAction ?? null,
      accent: input.accent,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .returning();

  return project ?? null;
}

export function listComponentsForProject(projectId) {
  return getDatabase()
    .select()
    .from(components)
    .where(eq(components.projectId, projectId))
    .orderBy(asc(components.name));
}

export function listResourcesForProject(projectId) {
  return getDatabase()
    .select()
    .from(resources)
    .where(eq(resources.projectId, projectId))
    .orderBy(asc(resources.label));
}

export async function findResourceByProviderAndExternalId(
  provider,
  externalId,
) {
  const [resource] = await getDatabase()
    .select()
    .from(resources)
    .where(
      and(
        eq(resources.provider, provider),
        eq(resources.externalId, externalId),
      ),
    )
    .limit(1);

  return resource ?? null;
}

export function listProviderResourceConnections(provider) {
  return getDatabase()
    .select({
      externalId: resources.externalId,
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(resources)
    .innerJoin(projects, eq(resources.projectId, projects.id))
    .where(
      and(eq(resources.provider, provider), isNotNull(resources.externalId)),
    );
}
