"use server";

import { revalidatePath } from "next/cache";

import { requireAccessSession } from "../../../lib/access/server.js";
import {
  discoverGitHubRepositories,
  GitHubDiscoveryError,
} from "../../../lib/github/index.js";
import { importGitHubRepositoryCandidates } from "../../../lib/projects/import-github.js";
import { ImportValidationError } from "../../../lib/projects/import-logic.js";

export async function importGitHubRepositoriesAction(_previousState, formData) {
  await requireAccessSession();
  const serializedPayload = formData.get("payload");

  if (typeof serializedPayload !== "string") {
    return {
      status: "error",
      message: "The import request was incomplete. Review the Projects and try again.",
    };
  }

  try {
    const payload = JSON.parse(serializedPayload);
    const repositories = await discoverGitHubRepositories();
    const result = await importGitHubRepositoryCandidates(
      payload.candidates,
      repositories,
    );

    revalidatePath("/setup/github");

    return {
      status: "success",
      message: `${result.importedRepositoryCount} ${result.importedRepositoryCount === 1 ? "repository" : "repositories"} added to ProjectDeck.`,
      result,
    };
  } catch (error) {
    if (
      error instanceof GitHubDiscoveryError ||
      error instanceof ImportValidationError
    ) {
      return { status: "error", message: error.message };
    }

    return {
      status: "error",
      message:
        "ProjectDeck could not save this import because the database is unavailable. No partial import was kept.",
    };
  }
}
