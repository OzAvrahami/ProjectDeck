"use server";

import { revalidatePath } from "next/cache";

import { requireAccessSession } from "../../../lib/access/server.js";
import {
  createResourceAndMonitor,
  createResourceMonitor,
  getProjectWorkspaceBySlug,
  updateResourceMonitorState,
} from "../../../lib/projects/queries.js";
import { validateHealthMonitorInput } from "../../../lib/projects/health-monitor-config.js";

function field(formData, name) {
  return String(formData.get(name) ?? "").trim();
}

export async function createHealthMonitorAction(_previousState, formData) {
  await requireAccessSession();
  const slug = field(formData, "slug");

  if (!slug) return { status: "error", message: "Project is required." };

  try {
    const project = await getProjectWorkspaceBySlug(slug);

    if (!project) {
      return { status: "error", message: "The Project no longer exists." };
    }

    const validation = validateHealthMonitorInput(
      Object.fromEntries(formData.entries()),
      project,
    );
    if (!validation.valid) {
      return {
        status: "error",
        message: Object.values(validation.errors)[0],
        errors: validation.errors,
      };
    }
    const value = validation.value;

    if (value.resource?.id) {
      await createResourceMonitor({
        projectId: project.id,
        resourceId: value.resource.id,
        componentId: value.componentId ?? value.resource.componentId,
        label: value.label,
        monitorType: value.monitorType,
        enabled: value.enabled,
        affectsProjectHealth: value.affectsProjectHealth,
        configuration: value.configuration,
      });
    } else if (value.resource) {
      await createResourceAndMonitor({
        resource: {
          ...value.resource,
          projectId: project.id,
          componentId: value.componentId,
        },
        monitor: {
          projectId: project.id,
          componentId: value.componentId,
          label: value.label,
          monitorType: value.monitorType,
          enabled: value.enabled,
          affectsProjectHealth: value.affectsProjectHealth,
          configuration: value.configuration,
        },
      });
    } else {
      await createResourceMonitor({
        projectId: project.id,
        componentId: value.componentId,
        label: value.label,
        monitorType: value.monitorType,
        enabled: value.enabled,
        affectsProjectHealth: value.affectsProjectHealth,
        configuration: value.configuration,
      });
    }

    revalidatePath(`/projects/${slug}`);
    revalidatePath("/");
    revalidatePath("/projects");
    return { status: "success", message: `${value.label} monitor added.` };
  } catch (error) {
    if (error?.code === "23505") {
      return {
        status: "error",
        message: "That resource already has this monitor type.",
      };
    }

    return {
      status: "error",
      message: "ProjectDeck could not save this monitor.",
    };
  }
}

export async function updateHealthMonitorAction(formData) {
  await requireAccessSession();
  const slug = field(formData, "slug");
  const monitorId = field(formData, "monitorId");
  const enabled = field(formData, "enabled") === "true";
  const affectsProjectHealth = field(formData, "affectsProjectHealth") === "true";

  try {
    const project = await getProjectWorkspaceBySlug(slug);
    if (!project) return;
    const monitor = project.healthMonitors.find(({ id }) => id === monitorId);
    if (!monitor) return;

    await updateResourceMonitorState(monitorId, project.id, {
      enabled,
      affectsProjectHealth,
    });
    revalidatePath(`/projects/${slug}`);
    revalidatePath("/");
    revalidatePath("/projects");
  } catch {
    // The server-rendered view remains the source of truth after a failed edit.
  }
}
