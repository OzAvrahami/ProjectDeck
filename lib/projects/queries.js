import "server-only";

import { and, asc, eq, isNotNull } from "drizzle-orm";

import { getDatabase } from "../../db/client.js";
import { components, projects, resources } from "../../db/schema.js";

export function listProjects() {
  return getDatabase().select().from(projects).orderBy(asc(projects.name));
}

export async function listPortfolioProjects() {
  const database = getDatabase();
  const [projectRows, componentRows] = await database.batch([
    database.select().from(projects).orderBy(asc(projects.name)),
    database
      .select({
        id: components.id,
        projectId: components.projectId,
        name: components.name,
      })
      .from(components)
      .orderBy(asc(components.name)),
  ]);
  const componentsByProjectId = new Map();

  for (const component of componentRows) {
    const projectComponents =
      componentsByProjectId.get(component.projectId) ?? [];
    projectComponents.push(component);
    componentsByProjectId.set(component.projectId, projectComponents);
  }

  return projectRows.map((project) => ({
    ...project,
    components: componentsByProjectId.get(project.id) ?? [],
  }));
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
