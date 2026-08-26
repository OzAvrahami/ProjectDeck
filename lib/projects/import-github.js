import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { getDatabase } from "../../db/client.js";
import { components, projects, resources } from "../../db/schema.js";
import {
  chooseProjectAccent,
  ImportValidationError,
  isDuplicateExternalIdentityError,
  uniqueProjectSlug,
  validateGitHubImportCandidates,
} from "./import-logic.js";

export async function importGitHubRepositoryCandidates(
  candidates,
  discoveredRepositories,
) {
  const normalizedCandidates = validateGitHubImportCandidates(candidates);
  const repositoryByExternalId = new Map(
    discoveredRepositories.map((repository) => [repository.id, repository]),
  );
  const selectedExternalIds = normalizedCandidates.flatMap((candidate) =>
    candidate.repositories.map((repository) => repository.externalId),
  );

  for (const externalId of selectedExternalIds) {
    if (!repositoryByExternalId.has(externalId)) {
      throw new ImportValidationError(
        "A selected repository is no longer available from GitHub. Scan again before importing.",
      );
    }
  }

  const db = getDatabase();
  const [existingResources, existingProjects] = await Promise.all([
    db
      .select({ externalId: resources.externalId })
      .from(resources)
      .where(
        and(
          eq(resources.provider, "github"),
          inArray(resources.externalId, selectedExternalIds),
        ),
      ),
    db.select().from(projects),
  ]);

  if (existingResources.length > 0) {
    throw new ImportValidationError(
      "One or more selected repositories are already in ProjectDeck. Scan again to refresh their status.",
    );
  }

  const existingProjectById = new Map(
    existingProjects.map((project) => [project.id, project]),
  );
  const targetProjectIds = [
    ...new Set(
      normalizedCandidates
        .map((candidate) => candidate.targetProjectId)
        .filter(Boolean),
    ),
  ];

  for (const projectId of targetProjectIds) {
    if (!existingProjectById.has(projectId)) {
      throw new ImportValidationError(
        "An existing Project selected for import could not be found.",
      );
    }
  }

  const existingComponents =
    targetProjectIds.length > 0
      ? await db
          .select()
          .from(components)
          .where(inArray(components.projectId, targetProjectIds))
      : [];
  const componentIdByProjectAndName = new Map(
    existingComponents.map((component) => [
      `${component.projectId}\u0000${component.name.toLowerCase()}`,
      component.id,
    ]),
  );
  const usedSlugs = new Set(existingProjects.map((project) => project.slug));
  const projectRows = [];
  const componentRows = [];
  const resourceRows = [];
  let attachedProjectCount = 0;

  for (const candidate of normalizedCandidates) {
    const candidateRepositories = candidate.repositories.map(({ externalId }) =>
      repositoryByExternalId.get(externalId),
    );
    let projectId = candidate.targetProjectId;

    if (projectId) {
      attachedProjectCount += 1;
    } else {
      projectId = randomUUID();
      projectRows.push({
        id: projectId,
        slug: uniqueProjectSlug(candidate.projectName, usedSlugs),
        name: candidate.projectName,
        tagline:
          candidateRepositories.length === 1
            ? candidateRepositories[0].description ?? ""
            : "",
        lifecycleState: "active",
        needsAttention: false,
        nextAction: candidate.nextAction,
        accent: chooseProjectAccent(candidate.projectName),
      });
    }

    for (const repositoryInput of candidate.repositories) {
      const repository = repositoryByExternalId.get(
        repositoryInput.externalId,
      );
      let componentId = null;

      if (repositoryInput.componentName) {
        const componentKey = `${projectId}\u0000${repositoryInput.componentName.toLowerCase()}`;
        componentId = componentIdByProjectAndName.get(componentKey);

        if (!componentId) {
          componentId = randomUUID();
          componentIdByProjectAndName.set(componentKey, componentId);
          componentRows.push({
            id: componentId,
            projectId,
            name: repositoryInput.componentName,
          });
        }
      }

      resourceRows.push({
        id: randomUUID(),
        projectId,
        componentId,
        resourceType: "repository",
        label: repository.fullName,
        url: repository.url,
        provider: "github",
        externalId: repository.id,
      });
    }
  }

  const statements = [];

  if (projectRows.length > 0) {
    statements.push(db.insert(projects).values(projectRows));
  }

  if (componentRows.length > 0) {
    statements.push(db.insert(components).values(componentRows));
  }

  statements.push(db.insert(resources).values(resourceRows));

  try {
    await db.batch(statements);
  } catch (error) {
    if (isDuplicateExternalIdentityError(error)) {
      throw new ImportValidationError(
        "A selected repository was imported by another request. Scan again to refresh its status.",
      );
    }

    throw error;
  }

  return {
    createdProjectCount: projectRows.length,
    attachedProjectCount,
    createdComponentCount: componentRows.length,
    importedRepositoryCount: resourceRows.length,
    importedExternalIds: resourceRows.map((resource) => resource.externalId),
  };
}
