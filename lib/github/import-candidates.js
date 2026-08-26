import {
  suggestComponentName,
  suggestGroupProjectName,
  suggestProjectName,
} from "./repositories.js";

function createProjectCandidate(repository) {
  return {
    id: `candidate-${repository.id}`,
    targetProjectId: "",
    projectName: suggestProjectName(repository.name),
    nextAction: "",
    repositories: [{ externalId: repository.id, componentName: "" }],
  };
}

export function createProjectCandidates(repositories) {
  return repositories.map(createProjectCandidate);
}

export function createGroupingDraft(
  candidates,
  selectedCandidateIds,
  repositories,
) {
  const selectedIds = new Set(selectedCandidateIds);
  const selectedCandidates = candidates.filter((candidate) =>
    selectedIds.has(candidate.id),
  );

  if (selectedCandidates.length < 2) {
    return null;
  }

  const repositoryById = new Map(
    repositories.map((repository) => [repository.id, repository]),
  );
  const groupedRepositories = selectedCandidates.flatMap((candidate) =>
    candidate.repositories.map((assignment) =>
      repositoryById.get(assignment.externalId),
    ),
  );

  if (groupedRepositories.some((repository) => !repository)) {
    return null;
  }

  return {
    candidateIds: selectedCandidates.map((candidate) => candidate.id),
    projectName: suggestGroupProjectName(groupedRepositories),
    repositories: groupedRepositories.map((repository) => ({
      externalId: repository.id,
      componentName: suggestComponentName(repository, groupedRepositories),
    })),
  };
}

export function applyCandidateGrouping(candidates, draft) {
  if (!draft || draft.candidateIds.length < 2) {
    return candidates;
  }

  const groupedIds = new Set(draft.candidateIds);
  const insertionIndex = candidates.findIndex((candidate) =>
    groupedIds.has(candidate.id),
  );

  if (insertionIndex < 0) {
    return candidates;
  }

  const groupedCandidate = {
    id: candidates[insertionIndex].id,
    targetProjectId: "",
    projectName: draft.projectName,
    nextAction: "",
    repositories: draft.repositories,
  };

  return candidates.flatMap((candidate, index) => {
    if (index === insertionIndex) {
      return [groupedCandidate];
    }

    return groupedIds.has(candidate.id) ? [] : [candidate];
  });
}

export function separateProjectCandidate(
  candidates,
  candidateId,
  repositories,
) {
  const repositoryById = new Map(
    repositories.map((repository) => [repository.id, repository]),
  );

  return candidates.flatMap((candidate) => {
    if (candidate.id !== candidateId || candidate.repositories.length < 2) {
      return [candidate];
    }

    return candidate.repositories
      .map((assignment) => repositoryById.get(assignment.externalId))
      .filter(Boolean)
      .map(createProjectCandidate);
  });
}
