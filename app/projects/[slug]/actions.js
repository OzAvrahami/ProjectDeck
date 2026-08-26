"use server";

import { revalidatePath } from "next/cache";

import { requireAccessSession } from "../../../lib/access/server.js";
import {
  createResource,
  getProjectWorkspaceBySlug,
} from "../../../lib/projects/queries.js";
import { railwayExternalId } from "../../../lib/railway/index.js";

function field(formData, name) {
  return String(formData.get(name) ?? "").trim();
}

export async function connectRailwayResourceAction(_previousState, formData) {
  await requireAccessSession();
  const slug = field(formData, "slug");
  const label = field(formData, "label");
  const railwayProjectId = field(formData, "railwayProjectId");
  const environmentId = field(formData, "environmentId");
  const serviceId = field(formData, "serviceId");
  const componentId = field(formData, "componentId") || null;

  if (!slug || !label || !railwayProjectId || !environmentId || !serviceId) {
    return {
      status: "error",
      message:
        "Label, Railway project ID, environment ID, and service ID are required.",
    };
  }

  try {
    const project = await getProjectWorkspaceBySlug(slug);

    if (!project) {
      return { status: "error", message: "The Project no longer exists." };
    }

    if (
      componentId &&
      !project.components.some(({ id }) => id === componentId)
    ) {
      return {
        status: "error",
        message: "The selected Component is not part of this Project.",
      };
    }

    await createResource({
      projectId: project.id,
      componentId,
      resourceType: "service",
      label,
      provider: "railway",
      externalId: railwayExternalId({
        projectId: railwayProjectId,
        environmentId,
        serviceId,
      }),
      url: `https://railway.com/project/${encodeURIComponent(railwayProjectId)}/service/${encodeURIComponent(serviceId)}?environmentId=${encodeURIComponent(environmentId)}`,
    });

    revalidatePath(`/projects/${slug}`);
    return { status: "success", message: `${label} connected to Railway.` };
  } catch (error) {
    if (error?.code === "23505") {
      return {
        status: "error",
        message: "That Railway service is already connected.",
      };
    }

    return {
      status: "error",
      message: "ProjectDeck could not save this Railway connection.",
    };
  }
}
