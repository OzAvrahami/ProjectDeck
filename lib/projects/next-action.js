import { parseGitHubRepositoryResource } from "../github/resource-identity.js";

export const NEXT_SOURCES = ["manual", "inferred", "none", "unavailable"];

export const NEXT_STATUS_PRECEDENCE = [
  "In Progress",
  "Verify",
  "Ready",
];

export const NEXT_PRIORITY_PRECEDENCE = [
  "P0 — Critical",
  "P1 — High",
  "P2 — Medium",
  "P3 — Low",
];

const STATUS_RANK = new Map(
  NEXT_STATUS_PRECEDENCE.map((status, index) => [status, index]),
);
const PRIORITY_RANK = new Map(
  NEXT_PRIORITY_PRECEDENCE.map((priority, index) => [priority, index]),
);

function cleanOptionalText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function validTimestamp(value) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(timestamp) ? null : timestamp;
}

function normalizedRepositoryName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function priorityRank(priority) {
  if (PRIORITY_RANK.has(priority)) {
    return PRIORITY_RANK.get(priority);
  }

  // Unset is an explicitly supported final Standard v1 priority. Unknown
  // values remain eligible but rank after every recognized or unset value.
  return priority == null ? NEXT_PRIORITY_PRECEDENCE.length : 99;
}

function stableRepositoryIdentity(item) {
  const repositoryName = normalizedRepositoryName(item.repository);

  return String(
    item.repositoryDatabaseId ?? (repositoryName || item.repositoryId || ""),
  );
}

function candidateOrder(left, right) {
  const statusDifference =
    STATUS_RANK.get(left.status) - STATUS_RANK.get(right.status);

  if (statusDifference !== 0) {
    return statusDifference;
  }

  const priorityDifference =
    priorityRank(left.priority) - priorityRank(right.priority);

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  // GitHub does not expose when an item entered a particular Status. The
  // deterministic fallback is newest Issue update, then stable repository
  // identity, then Issue number, and finally the immutable Issue/item ID.
  const leftUpdatedAt = validTimestamp(left.updatedAt);
  const rightUpdatedAt = validTimestamp(right.updatedAt);

  if (leftUpdatedAt !== rightUpdatedAt) {
    return (rightUpdatedAt ?? -1) - (leftUpdatedAt ?? -1);
  }

  const repositoryDifference = stableRepositoryIdentity(left).localeCompare(
    stableRepositoryIdentity(right),
  );

  if (repositoryDifference !== 0) {
    return repositoryDifference;
  }

  const numberDifference = Number(left.number) - Number(right.number);

  if (numberDifference !== 0) {
    return numberDifference;
  }

  return String(left.id ?? left.itemId ?? "").localeCompare(
    String(right.id ?? right.itemId ?? ""),
  );
}

function isIssueCandidate(item) {
  const itemType = String(item.type ?? item.contentType ?? "issue").toLowerCase();

  return (
    itemType === "issue" &&
    item.isPullRequest !== true &&
    item.state === "open" &&
    STATUS_RANK.has(item.status)
  );
}

function unavailable(reason, evidence = {}) {
  return {
    action: null,
    source: "unavailable",
    issueNumber: null,
    issueUrl: null,
    repository: null,
    component: null,
    status: null,
    priority: null,
    reason,
    confidence: "insufficient",
    evidence,
  };
}

function noClearNext(readModel, excludedItemCount) {
  return {
    action: null,
    source: "none",
    issueNumber: null,
    issueUrl: null,
    repository: null,
    component: null,
    status: null,
    priority: null,
    reason: "No open Issues in In Progress, Verify, or Ready",
    confidence: "high",
    evidence: {
      githubProject: {
        id: readModel.id,
        title: readModel.title,
        url: readModel.url,
      },
      eligibleCandidateCount: 0,
      excludedItemCount,
    },
  };
}

function resolutionUnavailable(projectResolution) {
  if (!projectResolution || projectResolution.status === "unavailable") {
    const code = projectResolution?.error?.code ?? "provider_failed";
    const reason =
      code === "token_missing"
        ? "GitHub Projects token is not configured"
        : code === "provider_failed"
          ? "GitHub Projects provider is unavailable"
          : "GitHub Projects access is unavailable";

    return unavailable(reason, { providerError: code });
  }

  if (projectResolution.status === "ambiguous") {
    return unavailable("Multiple matching GitHub Projects found", {
      resolutionStatus: "ambiguous",
      candidates: (projectResolution.candidates ?? []).map(({ id, title }) => ({
        id,
        title,
      })),
    });
  }

  return unavailable(
    projectResolution.reason === "no_connected_repositories"
      ? "No connected GitHub repositories"
      : "GitHub Project could not be resolved",
    {
      resolutionStatus: "unresolved",
      resolutionReason: projectResolution.reason ?? "no_match",
    },
  );
}

function connectedRepositoryContext(project, item) {
  const connected = (project.githubRepositories ?? []).map((resource) => ({
    resource,
    identity: parseGitHubRepositoryResource(resource),
  }));
  const itemFullName = normalizedRepositoryName(item.repository);
  const matching = connected.find(({ resource, identity }) => {
    if (
      item.repositoryDatabaseId &&
      resource.externalId &&
      String(item.repositoryDatabaseId) === String(resource.externalId)
    ) {
      return true;
    }

    return (
      itemFullName &&
      normalizedRepositoryName(identity?.fullName) === itemFullName
    );
  });
  const repositoryName =
    item.repository?.split("/").at(-1) ?? matching?.identity?.name ?? null;

  return {
    repository: {
      databaseId: item.repositoryDatabaseId ?? matching?.resource.externalId ?? null,
      nodeId: item.repositoryId ?? null,
      fullName: item.repository ?? matching?.identity?.fullName ?? null,
      name: repositoryName,
    },
    component: matching?.resource.componentId
      ? {
          id: matching.resource.componentId,
          name: matching.resource.componentName ?? null,
        }
      : null,
    contextLabel:
      matching?.resource.componentName ??
      (connected.length > 1 ? repositoryName : null),
  };
}

export function inferProjectNextAction({
  manualOverride = null,
  projectResolution,
  project = {},
}) {
  const manualAction = cleanOptionalText(manualOverride);

  if (manualAction) {
    return {
      action: manualAction,
      source: "manual",
      issueNumber: null,
      issueUrl: null,
      repository: null,
      component: null,
      status: null,
      priority: null,
      reason: "Manual override",
      confidence: "explicit",
      evidence: {},
    };
  }

  if (projectResolution?.status !== "resolved") {
    return resolutionUnavailable(projectResolution);
  }

  const readModel = projectResolution.readModel;

  if (!readModel) {
    return unavailable("GitHub Project data is unavailable");
  }

  if (!readModel.statusField?.standard) {
    return unavailable("GitHub Project Status workflow is nonstandard", {
      githubProject: {
        id: readModel.id,
        title: readModel.title,
        url: readModel.url,
      },
      statusOptions: readModel.statusField?.options ?? [],
    });
  }

  if (readModel.partial) {
    return unavailable("GitHub Project evidence is incomplete", {
      githubProject: {
        id: readModel.id,
        title: readModel.title,
        url: readModel.url,
      },
      evidenceStatus: "partial",
    });
  }

  const items = readModel.items ?? [];
  const candidates = items.filter(isIssueCandidate).sort(candidateOrder);

  if (candidates.length === 0) {
    return noClearNext(readModel, items.length);
  }

  const selected = candidates[0];
  const context = connectedRepositoryContext(project, selected);
  const priorityReason = selected.priority
    ? `${selected.priority} ranks within ${selected.status}`
    : `Unset Priority ranks after recognized priorities within ${selected.status}`;

  return {
    action: selected.title,
    source: "inferred",
    issueNumber: selected.number,
    issueUrl: selected.url ?? null,
    repository: context.repository,
    component: context.component,
    contextLabel: context.contextLabel,
    status: selected.status,
    priority: selected.priority ?? null,
    reason: `${selected.status} is the highest workflow stage available; ${priorityReason}`,
    confidence: "high",
    evidence: {
      githubProject: {
        id: readModel.id,
        title: readModel.title,
        url: readModel.url,
      },
      eligibleCandidateCount: candidates.length,
      tieBreaker:
        "Issue updated time descending, repository identity ascending, Issue number ascending",
    },
  };
}

export function attachProjectNextActions(projects, evidenceByProjectId) {
  return projects.map((project) => ({
    ...project,
    next: inferProjectNextAction({
      manualOverride: project.nextAction,
      projectResolution: evidenceByProjectId.get(project.id),
      project,
    }),
  }));
}
