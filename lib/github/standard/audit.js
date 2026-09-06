import {
  GITHUB_DEVELOPMENT_STANDARD_VERSION,
  STANDARD_META_LABELS,
  STANDARD_PRIMARY_TYPE_LABELS,
  STANDARD_PROJECT_FIELDS,
  STANDARD_PROJECT_VIEWS,
  STANDARD_RELEASE_TAG_PATTERN,
  STANDARD_REPOSITORY_LABELS,
} from "./definition.js";

function normalizedName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function finding({
  id,
  area,
  classification,
  target,
  current,
  desired,
  action = null,
  safeToAutomate = false,
  reason,
  evidence = null,
}) {
  return {
    id,
    area,
    classification,
    target,
    current,
    desired,
    action,
    safeToAutomate,
    reason,
    evidence,
  };
}

function projectIdentity(workflowEvidence) {
  const project = workflowEvidence?.project ?? workflowEvidence?.readModel;

  return project
    ? {
        id: project.id,
        number: project.number ?? null,
        title: project.title,
        url: project.url ?? null,
      }
    : null;
}

function auditProjectResolution(workflowEvidence) {
  if (workflowEvidence?.status === "resolved") {
    return finding({
      id: "project:resolution",
      area: "github_project",
      classification:
        workflowEvidence.repositoryVisibility === "partial"
          ? "unknown"
          : "conformant",
      target: projectIdentity(workflowEvidence),
      current:
        workflowEvidence.repositoryVisibility === "partial"
          ? "Exactly one Project resolved with partial repository visibility"
          : "Exactly one Project resolved from the connected repository set",
      desired: "Exactly one GitHub Project resolved by stable repository identity",
      reason:
        workflowEvidence.repositoryVisibility === "partial"
          ? "The Project identity is unambiguous, but GitHub hid part of its repository evidence."
          : "The connected repository set identifies one GitHub Project.",
      evidence: {
        resolutionReason: workflowEvidence.reason,
        repositoryVisibility: workflowEvidence.repositoryVisibility ?? "complete",
      },
    });
  }

  const ambiguous = workflowEvidence?.status === "ambiguous";
  const unavailable = workflowEvidence?.status === "unavailable";

  return finding({
    id: "project:resolution",
    area: "github_project",
    classification: unavailable ? "unknown" : "blocked",
    target: null,
    current: ambiguous
      ? "Multiple matching GitHub Projects"
      : unavailable
        ? "GitHub Project evidence unavailable"
        : "No exact GitHub Project resolution",
    desired: "Exactly one GitHub Project resolved by stable repository identity",
    reason: ambiguous
      ? "ProjectDeck will not choose between multiple matching Projects."
      : unavailable
        ? workflowEvidence?.error?.message ?? "GitHub Project evidence could not be read."
        : "The connected repository set does not identify exactly one Project.",
    evidence: {
      resolutionStatus: workflowEvidence?.status ?? "unavailable",
      resolutionReason: workflowEvidence?.reason ?? null,
      candidates: (workflowEvidence?.candidates ?? []).map(({ id, title, url }) => ({
        id,
        title,
        url: url ?? null,
      })),
    },
  });
}

function auditProjectField(fieldName, readModel, githubProject) {
  const expectedOptions = STANDARD_PROJECT_FIELDS[fieldName];
  const fieldKey = fieldName.toLowerCase();
  const field = fieldName === "Status"
    ? readModel.statusField
    : readModel.priorityField;
  const target = {
    kind: "github_project_field",
    project: githubProject,
    fieldName,
  };

  if (field?.available && field.standard) {
    return finding({
      id: `project:field:${fieldKey}`,
      area: "project_field",
      classification: "conformant",
      target,
      current: field.options,
      desired: expectedOptions,
      reason: `${fieldName} exists with the exact Standard-v1 options and order.`,
    });
  }

  if (field?.available) {
    const usedValues = [...new Set(
      (readModel.items ?? [])
        .map((item) => item[fieldKey])
        .filter(Boolean),
    )];

    return finding({
      id: `project:field:${fieldKey}`,
      area: "project_field",
      classification: "manual_required",
      target,
      current: field.options,
      desired: expectedOptions,
      reason: `${fieldName} has non-standard options. ProjectDeck will not rename, remove, reorder, or guess mappings for an existing field.`,
      evidence: { usedValues },
    });
  }

  if (readModel.fieldsPartial) {
    return finding({
      id: `project:field:${fieldKey}`,
      area: "project_field",
      classification: "unknown",
      target,
      current: "Field not present in partial Project field evidence",
      desired: expectedOptions,
      reason: `ProjectDeck cannot prove that ${fieldName} is missing because GitHub returned only part of the field collection.`,
    });
  }

  const conflictingField = (readModel.fields ?? []).find(
    (candidate) =>
      normalizedName(candidate.name) === normalizedName(fieldName),
  );

  if (conflictingField) {
    return finding({
      id: `project:field:${fieldKey}`,
      area: "project_field",
      classification: "manual_required",
      target,
      current: `Conflicting ${conflictingField.type ?? "unknown-type"} field named ${conflictingField.name}`,
      desired: expectedOptions,
      reason: `A case-variant or incompatible ${fieldName} field already exists; creating a second field could make the workflow ambiguous.`,
    });
  }

  return finding({
    id: `project:field:${fieldKey}`,
    area: "project_field",
    classification: "safe_change",
    target,
    current: "Missing",
    desired: expectedOptions,
    action: "create_project_single_select_field",
    safeToAutomate: true,
    reason: `Creating the missing ${fieldName} field is additive and does not alter existing Issue field values.`,
  });
}

function viewConforms(view, expected) {
  if (!view || view.name !== expected.name || view.layout !== expected.layout) {
    return false;
  }

  if (!expected.groupBy) return true;
  const groupingFields = view.layout === "BOARD_LAYOUT"
    ? view.verticalGroupByFields
    : view.groupByFields;
  return (groupingFields ?? []).some(
    (field) => field.name === expected.groupBy,
  );
}

function auditProjectViews(readModel, githubProject) {
  if (readModel.viewsPartial) {
    return [finding({
      id: "project:views:visibility",
      area: "project_view",
      classification: "unknown",
      target: githubProject,
      current: "Only the first 100 Project views were visible",
      desired: STANDARD_PROJECT_VIEWS,
      reason: "ProjectDeck will not plan view changes from partial provider evidence.",
    })];
  }

  return STANDARD_PROJECT_VIEWS.map((expected) => {
    const current = (readModel.views ?? []).find(
      (view) => view.name === expected.name,
    );

    if (viewConforms(current, expected)) {
      return finding({
        id: `project:view:${normalizedName(expected.name).replaceAll(" ", "-")}`,
        area: "project_view",
        classification: "conformant",
        target: { kind: "github_project_view", project: githubProject, name: expected.name },
        current,
        desired: expected,
        reason: `${expected.name} has the expected Standard-v1 layout.`,
      });
    }

    return finding({
      id: `project:view:${normalizedName(expected.name).replaceAll(" ", "-")}`,
      area: "project_view",
      classification: "manual_required",
      target: { kind: "github_project_view", project: githubProject, name: expected.name },
      current: current ?? "Missing",
      desired: expected,
      reason: current
        ? "Project view layout/grouping changes require review and are not automated in v1."
        : "Creating and configuring this Project view is left for explicit GitHub UI review in v1.",
    });
  });
}

function auditProjectWorkflows(readModel, githubProject) {
  return finding({
    id: "project:workflows",
    area: "project_workflow",
    classification: "unsupported",
    target: { kind: "github_project_workflows", project: githubProject },
    current: (readModel.workflows ?? []).map(({ name, enabled }) => ({
      name,
      enabled,
    })),
    desired: "Standard-v1 close/reopen native workflow behavior",
    reason: "GitHub exposes workflow names and enabled state, but not enough rule configuration to verify or safely configure the Standard-v1 behavior.",
  });
}

function auditIssueTypeConflicts(readModel, githubProject) {
  return (readModel.items ?? []).flatMap((item) => {
    const canonical = [...new Set(
      (item.labels ?? [])
        .map(normalizedName)
        .filter((label) => STANDARD_PRIMARY_TYPE_LABELS.includes(label)),
    )];

    if (canonical.length < 2) return [];

    return [finding({
      id: `issue:${item.repository ?? "unknown"}#${item.number}:primary-type`,
      area: "issue_type",
      classification: "manual_required",
      target: {
        kind: "github_issue",
        project: githubProject,
        repository: item.repository,
        number: item.number,
        title: item.title,
        url: item.url,
      },
      current: canonical,
      desired: "At most one canonical primary type label",
      reason: "ProjectDeck will not guess which existing canonical type label represents the Issue's intent.",
      evidence: {
        status: item.status,
        priority: item.priority,
      },
    })];
  });
}

function repositoryTarget(repositoryEvidence) {
  return {
    kind: "github_repository",
    resourceId: repositoryEvidence.resourceId ?? null,
    repository: repositoryEvidence.repository,
    component: repositoryEvidence.component ?? null,
  };
}

function auditRepositoryLabels(repositoryEvidence) {
  const target = repositoryTarget(repositoryEvidence);

  if (repositoryEvidence.status !== "available") {
    return [finding({
      id: `repository:${repositoryEvidence.repository?.fullName ?? repositoryEvidence.resourceId}:labels`,
      area: "repository_labels",
      classification: "unknown",
      target,
      current: "Repository labels unavailable",
      desired: STANDARD_REPOSITORY_LABELS,
      reason: repositoryEvidence.error?.message ?? "Repository labels could not be read.",
    })];
  }

  const labels = repositoryEvidence.labels ?? [];
  const byExactName = new Map(labels.map((label) => [label.name, label]));

  return STANDARD_REPOSITORY_LABELS.map((labelName) => {
    const exact = byExactName.get(labelName);
    const id = `repository:${repositoryEvidence.repository.fullName}:label:${labelName}`;

    if (exact) {
      return finding({
        id,
        area: STANDARD_META_LABELS.includes(labelName)
          ? "meta_label"
          : "primary_type_label",
        classification: "conformant",
        target: { ...target, label: labelName },
        current: labelName,
        desired: labelName,
        reason: `The canonical ${labelName} label exists.`,
      });
    }

    const collision = labels.find(
      (label) => normalizedName(label.name) === normalizedName(labelName),
    );

    if (collision) {
      return finding({
        id,
        area: STANDARD_META_LABELS.includes(labelName)
          ? "meta_label"
          : "primary_type_label",
        classification: "manual_required",
        target: { ...target, label: labelName },
        current: collision.name,
        desired: labelName,
        reason: "A case-variant label already exists. GitHub label identity is case-insensitive, so ProjectDeck will not create or rename it automatically.",
      });
    }

    return finding({
      id,
      area: STANDARD_META_LABELS.includes(labelName)
        ? "meta_label"
        : "primary_type_label",
      classification: "safe_change",
      target: { ...target, label: labelName },
      current: "Missing",
      desired: labelName,
      action: "create_repository_label",
      safeToAutomate: true,
      reason: "Creating this missing canonical label is additive; existing labels and Issue assignments are preserved.",
    });
  });
}

function auditRepositoryRelease(repositoryEvidence) {
  const target = repositoryTarget(repositoryEvidence);
  const id = `repository:${repositoryEvidence.repository?.fullName ?? repositoryEvidence.resourceId}:release`;

  if (repositoryEvidence.releaseStatus === "unavailable") {
    return finding({
      id,
      area: "release_convention",
      classification: "unknown",
      target,
      current: "Release evidence unavailable",
      desired: "Published Release tag matching Standard v1 when a Release exists",
      reason: "ProjectDeck could not inspect published GitHub Release evidence.",
    });
  }

  const release = repositoryEvidence.latestRelease;

  if (!release) {
    return finding({
      id,
      area: "release_convention",
      classification: "conformant",
      target,
      current: "No published GitHub Release",
      desired: "Published Release tags follow Standard v1 when releases exist",
      reason: "The Standard does not require a repository to publish a Release.",
    });
  }

  const conforms = STANDARD_RELEASE_TAG_PATTERN.test(release.tagName ?? release.tag);
  return finding({
    id,
    area: "release_convention",
    classification: conforms ? "conformant" : "manual_required",
    target,
    current: release.tagName ?? release.tag,
    desired: "vMAJOR.MINOR.PATCH, optionally -alpha.N or -beta.N",
    reason: conforms
      ? "The latest published GitHub Release uses the Standard-v1 tag convention."
      : "Published Release/tag history is authoritative provider state and is never renamed automatically.",
  });
}

function auditRepositoryIssueForms(repositoryEvidence) {
  const target = repositoryTarget(repositoryEvidence);

  return finding({
    id: `repository:${repositoryEvidence.repository?.fullName ?? repositoryEvidence.resourceId}:issue-forms`,
    area: "repository_files",
    classification: "unsupported",
    target,
    current: "Not inspected by the provider audit",
    desired: "Standard-v1 Issue Forms and blank-Issue configuration",
    reason: "Issue Forms are repository files. ProjectDeck does not inspect or commit repository files through provider Apply; review them in the connected repository.",
  });
}

function auditSummary(findings) {
  const counts = Object.fromEntries(
    ["conformant", "safe_change", "manual_required", "unsupported", "blocked", "unknown"]
      .map((classification) => [
        classification,
        findings.filter((item) => item.classification === classification).length,
      ]),
  );
  const status = counts.blocked > 0 || counts.unknown > 0
    ? "incomplete"
    : counts.safe_change > 0 || counts.manual_required > 0
      ? "differences"
      : "conformant";

  return { ...counts, status };
}

export function auditGitHubDevelopmentStandard({
  project,
  workflowEvidence,
  repositories,
  observedAt = new Date().toISOString(),
  writeCapabilities = { projects: false, repository: false },
}) {
  const findings = [auditProjectResolution(workflowEvidence)];
  const githubProject = projectIdentity(workflowEvidence);
  const readModel = workflowEvidence?.status === "resolved"
    ? workflowEvidence.readModel
    : null;

  if (readModel && githubProject) {
    findings.push(
      auditProjectField("Status", readModel, githubProject),
      auditProjectField("Priority", readModel, githubProject),
      ...auditProjectViews(readModel, githubProject),
      auditProjectWorkflows(readModel, githubProject),
      ...auditIssueTypeConflicts(readModel, githubProject),
    );

    if (readModel.partial) {
      findings.push(finding({
        id: "project:items:visibility",
        area: "project_visibility",
        classification: "unknown",
        target: githubProject,
        current: `${readModel.items?.length ?? 0} of ${readModel.totalItemCount ?? "unknown"} Project items readable`,
        desired: "Complete Project item evidence",
        reason: "Partial visibility prevents ProjectDeck from proving that all Issue workflow information was inspected.",
      }));
    }
  } else {
    findings.push(finding({
      id: "project:configuration",
      area: "project_field",
      classification: "blocked",
      target: null,
      current: "GitHub Project configuration unavailable",
      desired: STANDARD_PROJECT_FIELDS,
      reason: "Status, Priority, views, workflows, and Project items require one safely resolved GitHub Project.",
    }));
  }

  for (const repository of repositories) {
    findings.push(
      ...auditRepositoryLabels(repository),
      auditRepositoryRelease(repository),
      auditRepositoryIssueForms(repository),
    );
  }

  const orderedFindings = findings.sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const summary = auditSummary(orderedFindings);

  return {
    standard: `Oz GitHub Development Standard ${GITHUB_DEVELOPMENT_STANDARD_VERSION}`,
    version: GITHUB_DEVELOPMENT_STANDARD_VERSION,
    status: summary.status,
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
    },
    githubProject,
    projectResolution: {
      status: workflowEvidence?.status ?? "unavailable",
      reason: workflowEvidence?.reason ?? workflowEvidence?.error?.code ?? null,
      repositoryVisibility: workflowEvidence?.repositoryVisibility ?? null,
    },
    repositories,
    findings: orderedFindings,
    summary,
    preservation: {
      issueStatus: "preserved",
      issuePriority: "preserved",
      unknownLabels: "preserved",
      scopeLabels: "repository_specific",
    },
    writeCapabilities: {
      projects: {
        available: Boolean(writeCapabilities.projects),
        environmentVariable: "GITHUB_STANDARD_PROJECTS_WRITE_TOKEN",
        responsibility: "Additive GitHub Project field creation only",
      },
      repository: {
        available: Boolean(writeCapabilities.repository),
        environmentVariable: "GITHUB_STANDARD_REPOSITORY_WRITE_TOKEN",
        responsibility: "Additive canonical repository label creation only",
      },
    },
    observedAt,
  };
}
