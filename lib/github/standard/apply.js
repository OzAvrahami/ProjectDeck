import "server-only";

import { buildGitHubStandardMigrationPlan } from "./plan.js";
import {
  createGitHubStandardProjectsWriteClient,
  createGitHubStandardRepositoryWriteClient,
  GitHubStandardWriteError,
} from "./write-client.js";

function createWriteClientForCapability(capability) {
  if (capability === "projects") {
    return createGitHubStandardProjectsWriteClient();
  }

  if (capability === "repository") {
    return createGitHubStandardRepositoryWriteClient();
  }

  throw new GitHubStandardWriteError(
    "unknown_write_capability",
    "ProjectDeck rejected an unknown Standard write capability.",
  );
}

function applicationResult({
  attempted = 0,
  succeeded = [],
  failed = [],
  skipped = [],
  ...details
} = {}) {
  return { attempted, succeeded, failed, skipped, ...details };
}

function withPlan(audit) {
  return audit.plan
    ? audit
    : { ...audit, plan: buildGitHubStandardMigrationPlan(audit) };
}

export async function applyGitHubDevelopmentStandard({
  expectedFingerprint,
  loadAudit,
  createWriteClient = createWriteClientForCapability,
}) {
  const before = withPlan(await loadAudit());

  if (
    !expectedFingerprint ||
    expectedFingerprint !== before.plan.fingerprint
  ) {
    return {
      status: "stale",
      message: "GitHub changed since this plan was displayed. Review the refreshed audit before applying anything.",
      audit: before,
      application: applicationResult(),
    };
  }

  if (before.plan.safeSteps.length === 0) {
    return {
      status: "no_changes",
      message: "The current audit has no safe automated changes to apply.",
      audit: before,
      application: applicationResult(),
    };
  }

  const skipped = before.plan.blockedByCapabilitySteps.map((step) => ({
    stepId: step.id,
    action: step.action,
    capability: step.capability,
    message: `The ${step.capability} write capability is not configured.`,
  }));

  if (before.plan.executableSteps.length === 0) {
    return {
      status: "write_unavailable",
      message: "No configured Standard write capability can execute the current safe changes.",
      audit: before,
      application: applicationResult({ skipped }),
    };
  }

  const succeeded = [];
  const failed = [];
  const clients = new Map();

  for (const step of before.plan.executableSteps) {
    try {
      if (!clients.has(step.capability)) {
        clients.set(step.capability, createWriteClient(step.capability));
      }
      succeeded.push(await clients.get(step.capability).executeSafeStep(step));
    } catch (error) {
      failed.push({
        stepId: step.id,
        action: step.action,
        message:
          error instanceof GitHubStandardWriteError
            ? error.message
            : "GitHub did not apply this safe change.",
      });
    }
  }

  let after;
  try {
    after = withPlan(await loadAudit());
  } catch {
    return {
      status: succeeded.length > 0 ? "verification_unavailable" : "failed",
      message: "Apply finished, but ProjectDeck could not re-read GitHub to verify the resulting state.",
      audit: before,
      application: applicationResult({
        attempted: before.plan.executableSteps.length,
        succeeded,
        failed,
        skipped,
      }),
    };
  }

  const remainingSafeIds = new Set(
    after.plan.safeSteps.map((step) => step.id),
  );
  const unverifiedSuccesses = succeeded.filter((result) =>
    remainingSafeIds.has(result.stepId),
  );
  const verified =
    failed.length === 0 &&
    unverifiedSuccesses.length === 0 &&
    skipped.length === 0;
  const status = verified
    ? "verified"
    : succeeded.length > 0
      ? "partial"
      : "failed";

  return {
    status,
    message: verified
      ? "GitHub was re-read and every applied change is now verified."
      : "GitHub was re-read. Some safe changes failed, remain visible, or lacked their dedicated write capability.",
    audit: after,
    application: applicationResult({
      attempted: before.plan.executableSteps.length,
      succeeded,
      failed,
      skipped,
      unverifiedStepIds: unverifiedSuccesses.map(({ stepId }) => stepId),
    }),
  };
}
