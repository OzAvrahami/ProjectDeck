export const PROJECT_ACCENTS = ["258", "300", "150", "75", "190", "20"];

export class ImportValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImportValidationError";
  }
}

function cleanOptionalText(value) {
  if (value == null) {
    return null;
  }

  const cleaned = String(value).trim();
  return cleaned || null;
}

export function validateGitHubImportCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new ImportValidationError("Select at least one repository to import.");
  }

  const seenExternalIds = new Set();

  return candidates.map((candidate) => {
    const targetProjectId = cleanOptionalText(candidate.targetProjectId);
    const projectName = cleanOptionalText(candidate.projectName);

    if (!targetProjectId && !projectName) {
      throw new ImportValidationError(
        "Every new Project needs a display name.",
      );
    }

    if (projectName && projectName.length > 160) {
      throw new ImportValidationError(
        "Project display names must be 160 characters or fewer.",
      );
    }

    if (
      !Array.isArray(candidate.repositories) ||
      candidate.repositories.length === 0
    ) {
      throw new ImportValidationError(
        "Every Project candidate needs at least one repository.",
      );
    }

    const candidateRepositories = candidate.repositories.map((repository) => {
      const externalId = cleanOptionalText(repository.externalId);
      const componentName = cleanOptionalText(repository.componentName);

      if (!externalId || externalId.length > 255) {
        throw new ImportValidationError(
          "A selected repository has an invalid GitHub identity.",
        );
      }

      if (seenExternalIds.has(externalId)) {
        throw new ImportValidationError(
          "A repository can only appear once in an import.",
        );
      }

      if (componentName && componentName.length > 160) {
        throw new ImportValidationError(
          "Component names must be 160 characters or fewer.",
        );
      }

      seenExternalIds.add(externalId);

      return { externalId, componentName };
    });

    return {
      targetProjectId,
      projectName,
      nextAction: cleanOptionalText(candidate.nextAction),
      repositories: candidateRepositories,
    };
  });
}

export function slugifyProjectName(name) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");

  return slug || "project";
}

export function uniqueProjectSlug(name, usedSlugs) {
  const base = slugifyProjectName(name);
  let candidate = base;
  let suffix = 2;

  while (usedSlugs.has(candidate)) {
    const suffixText = `-${suffix}`;
    candidate = `${base.slice(0, 120 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }

  usedSlugs.add(candidate);
  return candidate;
}

export function chooseProjectAccent(name) {
  const hash = [...name].reduce(
    (value, character) => (value * 31 + character.codePointAt(0)) >>> 0,
    0,
  );

  return PROJECT_ACCENTS[hash % PROJECT_ACCENTS.length];
}

export function isDuplicateExternalIdentityError(error) {
  let current = error;

  while (current) {
    if (
      current.code === "23505" &&
      current.constraint === "resources_provider_external_id_unique"
    ) {
      return true;
    }

    current = current.cause;
  }

  return false;
}
