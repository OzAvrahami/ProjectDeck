import "server-only";

import { and, asc, eq, isNotNull } from "drizzle-orm";

import { getDatabase } from "../../db/client.js";
import { components, projects, resources } from "../../db/schema.js";

export function listProjects() {
  return getDatabase().select().from(projects).orderBy(asc(projects.name));
}

export async function listPortfolioProjects() {
  const database = getDatabase();
  const [projectRows, componentRows, resourceRows] = await database.batch([
    database.select().from(projects).orderBy(asc(projects.name)),
    database.select().from(components).orderBy(asc(components.name)),
    database.select().from(resources).orderBy(asc(resources.label)),
  ]);
  const componentsByProjectId = new Map();
  const componentById = new Map();
  const resourcesByProjectId = new Map();

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
