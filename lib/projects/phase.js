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

function repositoryEvidence(repository) {
  return {
    repository: repository.repository?.fullName ?? null,
    component: repository.component?.name ?? null,
    maturity: repository.maturity,
    activity: repository.activity,
  };
}

function implementationUnknown(implementation) {
  if (!implementation || implementation.status === "not_connected") {
    return unknown("No connected GitHub repositories");
  }

  if (implementation.status === "unavailable") {
    return unknown("Repository implementation evidence is unavailable", {
      failures: implementation.failures ?? [],
    });
  }

  return unknown("Implementation maturity could not be established", {
    evidenceStatus: implementation.status ?? "unavailable",
    repositories: (implementation.repositories ?? []).map(repositoryEvidence),
  });
}

export function inferProjectPhase({ override = null, implementation } = {}) {
  if (override) {
    return phaseResult(
      override,
      "override",
      "explicit",
      "Manual override",
    );
  }

  const repositories = implementation?.repositories ?? [];

  if (repositories.length === 0) {
    return implementationUnknown(implementation);
  }

  const evidence = {
    repositories: repositories.map(repositoryEvidence),
  };
  const implemented = repositories.filter(
    ({ maturity }) => maturity?.state === "implemented",
  );
  const released = repositories.filter(
    ({ maturity }) => maturity?.state === "released",
  );
  const notStarted = repositories.filter(
    ({ maturity }) => maturity?.state === "not_started",
  );
  const unknownMaturity = repositories.filter(
    ({ maturity }) => !maturity || maturity.state === "unknown",
  );
  const contradictory = notStarted.filter(
    ({ activity }) => activity?.state === "active",
  );

  if (implemented.length > 0) {
    return phaseResult(
      "development",
      "inferred",
      "high",
      implemented.length === 1
        ? "unreleased implementation exists"
        : `unreleased implementation exists in ${implemented.length} components`,
      evidence,
    );
  }

  const activelyReleased = released.filter(
    ({ activity }) => activity?.state === "active",
  );

  if (activelyReleased.length > 0) {
    return phaseResult(
      "development",
      "inferred",
      "high",
      activelyReleased.length === 1
        ? "released product has recent implementation activity"
        : `${activelyReleased.length} released components have recent implementation activity`,
      evidence,
    );
  }

  if (
    contradictory.length > 0 ||
    unknownMaturity.length > 0 ||
    implementation.status !== "complete"
  ) {
    return unknown("Implementation maturity could not be established", {
      ...evidence,
      evidenceStatus: implementation.status,
      contradictoryRepositoryCount: contradictory.length,
    });
  }

  if (released.length > 0) {
    const unknownActivity = released.filter(
      ({ activity }) => !activity || activity.state === "unknown",
    );

    if (unknownActivity.length > 0) {
      return unknown(
        "Recent implementation activity could not be established for a released product",
        evidence,
      );
    }

    if (released.every(({ activity }) => activity.state === "inactive")) {
      return phaseResult(
        "maintenance",
        "inferred",
        "high",
        released.length === 1
          ? "released product with no recent implementation activity"
          : `${released.length} released components with no recent implementation activity`,
        evidence,
      );
    }

    return unknown("Released-product activity evidence is contradictory", evidence);
  }

  if (notStarted.length === repositories.length) {
    return phaseResult(
      "planning",
      "inferred",
      "high",
      repositories.length === 1
        ? "implementation has not begun"
        : "implementation has not begun in connected components",
      evidence,
    );
  }

  return unknown("Available repository evidence does not support a Project phase", evidence);
}

export function attachProjectPhases(projects) {
  return projects.map((project) => ({
    ...project,
    phase: inferProjectPhase({
      override: project.phaseOverride,
      implementation: project.githubSummary?.implementation,
    }),
  }));
}
