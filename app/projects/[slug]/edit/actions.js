"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAccessSession } from "../../../../lib/access/server.js";
import { validateProjectEdit } from "../../../../lib/projects/edit.js";
import {
  getProjectBySlug,
  updateProjectOwnedFields,
} from "../../../../lib/projects/queries.js";

function field(formData, name) {
  return formData.get(name);
}

export async function updateProjectAction(_previousState, formData) {
  await requireAccessSession();

  const slug = String(field(formData, "slug") ?? "").trim();
  const validation = validateProjectEdit({
    name: field(formData, "name"),
    tagline: field(formData, "tagline"),
    phaseOverride: field(formData, "phaseOverride"),
    needsAttention: field(formData, "needsAttention"),
    attentionSummary: field(formData, "attentionSummary"),
    nextAction: field(formData, "nextAction"),
    accent: field(formData, "accent"),
  });

  if (!slug) {
    return {
      status: "error",
      message: "This Project could not be identified. Open it again and retry.",
      values: validation.values,
      errors: validation.errors,
    };
  }

  if (!validation.valid) {
    return {
      status: "error",
      message: "Review the highlighted fields and try again.",
      values: validation.values,
      errors: validation.errors,
    };
  }

  try {
    const project = await getProjectBySlug(slug);

    if (!project) {
      return {
        status: "error",
        message: "This Project no longer exists.",
        values: validation.values,
        errors: {},
      };
    }

    await updateProjectOwnedFields(project.id, validation.values);
  } catch {
    return {
      status: "error",
      message: "ProjectDeck could not save these changes. Your entries are still here.",
      values: validation.values,
      errors: {},
    };
  }

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/projects/${slug}`);
  revalidatePath(`/projects/${slug}/edit`);
  redirect(`/projects/${slug}?updated=1`);
}
