"use server";

import { revalidatePath } from "next/cache";

import { requireAccessSession } from "../../../../../lib/access/server.js";
import { listPortfolioProjects } from "../../../../../lib/projects/queries.js";
import {
  associateDiscoveredRailwayResource,
  getRailwayIntegrationView,
  removeRailwayResourceAssociation,
} from "../../../../../lib/railway/connection.js";
import { RAILWAY_MAPPINGS_PATH } from "../../../../../lib/railway/routes.js";

function field(formData, name) {
  return String(formData.get(name) ?? "").trim();
}

function revalidateMappingSurfaces(slugs = []) {
  revalidatePath(RAILWAY_MAPPINGS_PATH);
  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/projects");
  for (const slug of new Set(slugs.filter(Boolean))) {
    revalidatePath(`/projects/${slug}`);
  }
}

export async function saveRailwayMappingAction(_previousState, formData) {
  await requireAccessSession();
  const projectId = field(formData, "projectId");
  const componentId = field(formData, "componentId") || null;
  const externalId = field(formData, "externalId");

  if (!projectId || !externalId) {
    return { status: "error", message: "Choose a Project before saving." };
  }

  try {
    const [projects, integration] = await Promise.all([
      listPortfolioProjects(),
      getRailwayIntegrationView(),
    ]);
    const project = projects.find(({ id }) => id === projectId);
    if (!project) {
      return { status: "error", message: "The selected Project is unavailable." };
    }
    const previous = integration.associations.find(
      (association) => association.externalId === externalId,
    );

    await associateDiscoveredRailwayResource({
      project,
      componentId,
      externalId,
      affectsProjectHealth:
        field(formData, "affectsProjectHealth") === "true",
    });

    const previousSlug = projects.find(
      ({ id }) => id === previous?.projectId,
    )?.slug;
    revalidateMappingSurfaces([previousSlug, project.slug]);
    return { status: "success", message: "Railway mapping saved." };
  } catch {
    return {
      status: "error",
      message: "ProjectDeck could not save this Railway mapping.",
    };
  }
}

export async function removeRailwayMappingAction(_previousState, formData) {
  await requireAccessSession();
  const associationId = field(formData, "associationId");
  if (!associationId) {
    return { status: "error", message: "The Railway mapping is unavailable." };
  }

  try {
    const [projects, integration] = await Promise.all([
      listPortfolioProjects(),
      getRailwayIntegrationView(),
    ]);
    const association = integration.associations.find(
      ({ id }) => id === associationId,
    );
    if (!association) {
      return { status: "error", message: "The Railway mapping is unavailable." };
    }

    await removeRailwayResourceAssociation(associationId);
    const previousSlug = projects.find(
      ({ id }) => id === association.projectId,
    )?.slug;
    revalidateMappingSurfaces([previousSlug]);
    return { status: "success", message: "Railway mapping removed." };
  } catch {
    return {
      status: "error",
      message: "ProjectDeck could not remove this Railway mapping.",
    };
  }
}
