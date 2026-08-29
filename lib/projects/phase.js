export const PROJECT_PHASES = [
  "planning",
  "development",
  "maintenance",
  "paused",
  "archived",
  "unknown",
];

export const PROJECT_PHASE_LABELS = {
  planning: "Planning",
  development: "Development",
  maintenance: "Maintenance",
  paused: "Paused",
  archived: "Archived",
  unknown: "Unknown",
};

// A recent implementation commit is supporting evidence only while a product
// is unreleased. The bounded window prevents one old commit from implying
// Development indefinitely and is never used to infer Paused or Archived.
export const RECENT_DEVELOPMENT_ACTIVITY_DAYS = 21;

const ACTIVE_STATUSES = new Set(["Ready", "In Progress", "Verify"]);
const DEVELOPMENT_COMMIT_KINDS = new Set([
  "build",
  "feat",
  "fix",
  "perf",
  "refactor",
  "test",
]);

function phaseResult(phase, source, confidence, reason, evidence = {}) {
  return {
    phase,
    label: PROJECT_PHASE_LABELS[phase],
    source,
    confidence,
    reason,
    evidence,
  };
}

function unknown(reason, evidence = {}) {
  return phaseResult(
    "unknown",
    "unknown",
    "insufficient",
    reason,
    evidence,
  );
}

function validTime(value) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(timestamp) ? null : timestamp;
}

function recentDevelopmentActivity(activity, now) {
  const cutoff =
    now.getTime() - RECENT_DEVELOPMENT_ACTIVITY_DAYS * 24 * 60 * 60 * 1000;

  return (activity?.items ?? []).filter((item) => {
    const timestamp = validTime(item.committedAt);
    return (
      timestamp !== null &&
      timestamp >= cutoff &&
      DEVELOPMENT_COMMIT_KINDS.has(item.kind)
    );
  });
}

function activeWorkReason(items) {
  if (items.length === 1) {
    return `1 issue ${items[0].status}`;
  }

  return `${items.length} issues in active workflow states`;
}

function resolutionUnknown(resolution) {
  if (!resolution || resolution.status === "unavailable") {
    const providerError = resolution?.error?.code ?? "provider_failed";
    const reason =
      providerError === "token_missing"
        ? "GitHub Projects token is not configured"
        : providerError === "provider_failed"
          ? "GitHub Projects provider is unavailable"
          : "GitHub Projects access is unavailable";

    return unknown(reason, {
      providerError,
    });
  }

  if (resolution.status === "ambiguous") {
    return unknown("Multiple GitHub Projects match connected repositories", {
      candidates: (resolution.candidates ?? []).map(({ id, title }) => ({
        id,
        title,
      })),
    });
  }

  return unknown(
    resolution.reason === "no_connected_repositories"
      ? "No connected GitHub repositories"
      : "GitHub Project could not be resolved",
    { resolutionReason: resolution.reason },
  );
}

export function inferProjectPhase(
  {
    override = null,
    projectResolution,
    releases,
    activity,
  },
  { now = new Date() } = {},
) {
  if (override) {
    return phaseResult(
      override,
      "override",
      "explicit",
      "Manual override",
    );
  }

  if (projectResolution?.status !== "resolved") {
    return resolutionUnknown(projectResolution);
  }

  const readModel = projectResolution.readModel;

  if (!readModel) {
    return unknown("GitHub Project data is unavailable");
  }

  if (!readModel.statusField?.standard) {
    return unknown("GitHub Project Status workflow is nonstandard", {
      githubProject: {
        id: readModel.id,
        title: readModel.title,
      },
      statusOptions: readModel.statusField?.options ?? [],
    });
  }

  const unrecognizedItems = readModel.items.filter(
    (item) => !item.statusRecognized,
  );

  if (unrecognizedItems.length > 0) {
    return unknown("GitHub Project contains nonstandard Status values", {
      unrecognizedItemCount: unrecognizedItems.length,
    });
  }

  const closedActiveItems = readModel.items.filter(
    (item) => item.state === "closed" && ACTIVE_STATUSES.has(item.status),
  );

  if (closedActiveItems.length > 0) {
    return unknown("GitHub Project Status conflicts with closed Issue state", {
      conflictingItemCount: closedActiveItems.length,
    });
  }

  const openItems = readModel.items.filter((item) => item.state === "open");
  const activeItems = openItems.filter((item) =>
    ACTIVE_STATUSES.has(item.status),
  );
  const projectEvidence = {
    githubProject: {
      id: readModel.id,
      title: readModel.title,
      url: readModel.url,
    },
    activeItems: activeItems.map((item) => ({
      repository: item.repository,
      number: item.number,
      status: item.status,
    })),
  };

  if (activeItems.length > 0) {
    return phaseResult(
      "development",
      "inferred",
      "high",
      activeWorkReason(activeItems),
      projectEvidence,
    );
  }

  if (readModel.partial) {
    return unknown("GitHub Project evidence is partial", {
      ...projectEvidence,
      evidenceStatus: "partial",
    });
  }

  if (releases?.status !== "complete") {
    return unknown("Release evidence is unavailable or incomplete", {
      ...projectEvidence,
      releaseStatus: releases?.status ?? "unavailable",
    });
  }

  const publishedReleases = releases.items ?? [];

  if (publishedReleases.length > 0) {
    const latest = publishedReleases[0];
    const releaseReason = latest?.tagName
      ? `latest published release ${latest.tagName}, no active implementation`
      : "published release exists, no active implementation";

    return phaseResult(
      "maintenance",
      "inferred",
      "high",
      releaseReason,
      {
        ...projectEvidence,
        publishedReleases: publishedReleases.map((release) => ({
          repository: release.repository?.fullName ?? null,
          tagName: release.tagName,
          publishedAt: release.publishedAt,
        })),
      },
    );
  }

  if (activity?.status !== "complete") {
    return unknown("Recent activity evidence is unavailable or incomplete", {
      ...projectEvidence,
      activityStatus: activity?.status ?? "unavailable",
    });
  }

  const recentActivity = recentDevelopmentActivity(activity, now);

  if (recentActivity.length > 0) {
    return phaseResult(
      "development",
      "inferred",
      "high",
      `${recentActivity.length} recent implementation ${recentActivity.length === 1 ? "commit" : "commits"} in an unreleased project`,
      {
        ...projectEvidence,
        recentActivity: recentActivity.map((item) => ({
          repository: item.repository?.fullName ?? null,
          committedAt: item.committedAt,
          kind: item.kind,
        })),
      },
    );
  }

  const backlogItems = openItems.filter((item) => item.status === "Backlog");
  const onlyBacklog =
    backlogItems.length > 0 &&
    openItems.every((item) => item.status === "Backlog");

  if (onlyBacklog) {
    return phaseResult(
      "planning",
      "inferred",
      "high",
      `${backlogItems.length} backlog ${backlogItems.length === 1 ? "issue" : "issues"}, no release or recent implementation activity`,
      {
        ...projectEvidence,
        backlogCount: backlogItems.length,
      },
    );
  }

  return unknown("Available evidence does not support a Project phase", {
    ...projectEvidence,
    openIssueCount: openItems.length,
  });
}

export function attachProjectPhases(
  projects,
  evidenceByProjectId,
  { now = new Date() } = {},
) {
  return projects.map((project) => ({
    ...project,
    phase: inferProjectPhase(
      {
        override: project.phaseOverride,
        projectResolution: evidenceByProjectId.get(project.id),
        releases: project.githubSummary?.releases,
        activity: project.githubSummary?.activity,
      },
      { now },
    ),
  }));
}
