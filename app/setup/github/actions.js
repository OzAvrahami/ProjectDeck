"use server";

import { revalidatePath } from "next/cache";

import {
  discoverGitHubRepositories,
  GitHubDiscoveryError,
} from "../../../lib/github/index.js";
import { importGitHubRepositoryGroups } from "../../../lib/projects/import-github.js";
import { ImportValidationError } from "../../../lib/projects/import-logic.js";

export async function importGitHubRepositoriesAction(_previousState, formData) {
  const serializedPayload = formData.get("payload");

  if (typeof serializedPayload !== "string") {
    return {
      status: "error",
      message: "The import request was incomplete. Review the grouping and try again.",
    };
  }

  try {
    const payload = JSON.parse(serializedPayload);
    const repositories = await discoverGitHubRepositories();
    const result = await importGitHubRepositoryGroups(
      payload.groups,
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
