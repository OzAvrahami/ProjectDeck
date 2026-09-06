import { createHash } from "node:crypto";

import {
  STANDARD_PROJECT_FIELDS,
  STANDARD_REPOSITORY_LABELS,
  STANDARD_WRITE_CAPABILITY_BY_ACTION,
} from "./definition.js";

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function fingerprint(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function planStep(item, writeCapabilities) {
  const capability = STANDARD_WRITE_CAPABILITY_BY_ACTION[item.action] ?? null;
  const automated =
    item.classification === "safe_change" &&
    item.safeToAutomate === true;
  const capabilityAvailable = capability
    ? Boolean(writeCapabilities?.[capability]?.available)
    : false;

  return {
    id: item.id,
    classification: item.classification,
    target: item.target,
    current: item.current,
    desired: item.desired,
    action: item.action,
    automated,
    capability,
    capabilityAvailable,
    executable: automated && capabilityAvailable,
    reason: item.reason,
    evidence: item.evidence ?? null,
  };
}

export function isApprovedSafeStandardStep(step) {
  if (
    step?.classification !== "safe_change" ||
    step.automated !== true
  ) {
    return false;
  }

  if (step.action === "create_repository_label") {
    return (
      step.target?.kind === "github_repository" &&
      Boolean(step.target.repository?.owner) &&
      Boolean(step.target.repository?.name) &&
      STANDARD_REPOSITORY_LABELS.includes(step.target.label) &&
      step.current === "Missing" &&
      step.desired === step.target.label
    );
  }

  if (step.action === "create_project_single_select_field") {
    const fieldName = step.target?.fieldName;
    return (
      step.target?.kind === "github_project_field" &&
      Boolean(step.target.project?.id) &&
      Object.hasOwn(STANDARD_PROJECT_FIELDS, fieldName) &&
      step.current === "Missing" &&
      JSON.stringify(step.desired) ===
        JSON.stringify(STANDARD_PROJECT_FIELDS[fieldName])
    );
  }

  return false;
}

export function buildGitHubStandardMigrationPlan(audit) {
  const steps = audit.findings
    .filter((item) => item.classification !== "conformant")
    .map((item) => planStep(item, audit.writeCapabilities));
  const safeSteps = steps.filter(isApprovedSafeStandardStep);
  const executableSteps = safeSteps.filter((step) => step.executable);
  const blockedByCapabilitySteps = safeSteps.filter(
    (step) => !step.capabilityAvailable,
  );
  const manualSteps = steps.filter(
    (step) => !step.automated || !isApprovedSafeStandardStep(step),
  );
  const signature = {
    standard: audit.version,
    project: audit.project,
    githubProject: audit.githubProject,
    repositoryIdentities: audit.repositories.map((repository) => ({
      resourceId: repository.resourceId,
      fullName: repository.repository?.fullName ?? null,
      status: repository.status,
      labelNames: (repository.labels ?? []).map(({ name }) => name).sort(),
      releaseTag:
        repository.latestRelease?.tagName ??
        repository.latestRelease?.tag ??
        null,
    })),
    steps,
  };

  return {
    standard: audit.standard,
    project: audit.project,
    auditStatus: audit.status,
    fingerprint: fingerprint(signature),
    steps,
    safeSteps,
    executableSteps,
    blockedByCapabilitySteps,
    manualSteps,
    summary: {
      total: steps.length,
      safe: safeSteps.length,
      executable: executableSteps.length,
      unavailable: blockedByCapabilitySteps.length,
      manual: manualSteps.filter(
        (step) => step.classification === "manual_required",
      ).length,
      unsupported: manualSteps.filter(
        (step) => step.classification === "unsupported",
      ).length,
      blocked: manualSteps.filter(
        (step) => step.classification === "blocked",
      ).length,
      unknown: manualSteps.filter(
        (step) => step.classification === "unknown",
      ).length,
    },
    invariants: {
      destructiveCleanup: false,
      issueStatusMutation: false,
      issuePriorityMutation: false,
      labelRemoval: false,
      inferredMappings: false,
      repositoryFileMutation: false,
    },
  };
}
