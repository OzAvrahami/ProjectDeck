"use client";

import { useActionState } from "react";

import { applyGitHubStandardAction } from "../../app/projects/[slug]/actions.js";

const INITIAL_STATE = { status: "idle", message: null, audit: null };

const CLASSIFICATION_LABELS = {
  safe_change: "Safe change",
  manual_required: "Manual review",
  unsupported: "Unsupported",
  blocked: "Blocked",
  unknown: "Unknown",
};

const CAPABILITY_LABELS = {
  projects: "Projects write",
  repository: "Repository-label write",
};

function displayValue(value) {
  if (Array.isArray(value)) return value.join(" → ");
  if (value && typeof value === "object") {
    if (value.name && value.layout) {
      return `${value.name} · ${value.layout.replace("_LAYOUT", "").toLowerCase()}`;
    }
    return JSON.stringify(value);
  }
  return String(value ?? "Unknown");
}

function statusLabel(status) {
  return {
    conformant: "Conformant",
    differences: "Differences found",
    incomplete: "Audit incomplete",
  }[status] ?? "Unavailable";
}

function formatAuditTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "at an unknown time";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function PlanStep({ step }) {
  return (
    <li className="border-t border-line-soft py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`standard-classification standard-${step.classification}`}>
          {CLASSIFICATION_LABELS[step.classification] ?? step.classification}
        </span>
        <span className="font-mono text-[10px] text-muted">
          {step.target?.repository?.fullName ??
            step.target?.project?.title ??
            step.target?.repository ??
            "GitHub"}
        </span>
      </div>
      <p className="mt-2 text-xs font-semibold leading-5 text-subtle">
        {step.reason}
      </p>
      <p className="mt-1 font-mono text-[10px] leading-4 text-muted">
        {displayValue(step.current)} → {displayValue(step.desired)}
      </p>
      {step.evidence?.usedValues?.length > 0 ? (
        <p className="mt-1 text-[10px] leading-4 text-muted">
          Values currently in use: {step.evidence.usedValues.join(" · ")}
        </p>
      ) : null}
      {step.automated && step.capability ? (
        <p className="mt-1 text-[10px] leading-4 text-muted">
          {CAPABILITY_LABELS[step.capability]} · {step.capabilityAvailable ? "available" : "unavailable"}
        </p>
      ) : null}
    </li>
  );
}

export function GitHubDevelopmentStandardPanel({ initialAudit, slug }) {
  const [state, action, pending] = useActionState(
    applyGitHubStandardAction,
    INITIAL_STATE,
  );
  const audit = state.audit ?? initialAudit;

  if (!audit) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="text-sm font-semibold">Audit unavailable</p>
        <p className="mt-2 text-xs leading-5 text-muted">
          ProjectDeck could not assemble the connected GitHub evidence.
        </p>
      </div>
    );
  }

  const plan = audit.plan;
  const nonconformant = audit.findings.filter(
    (item) => item.classification !== "conformant",
  );
  const conformant = audit.findings.filter(
    (item) => item.classification === "conformant",
  );
  const resultIsError = [
    "error",
    "failed",
    "partial",
    "stale",
    "verification_unavailable",
    "write_unavailable",
  ].includes(state.status);

  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-[var(--card-shadow)]" id="github-standard">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Standard v1</p>
            <span className={`standard-audit-status standard-audit-${audit.status}`}>
              {statusLabel(audit.status)}
            </span>
            {state.status === "verified" ? (
              <span className="standard-audit-status standard-audit-conformant">
                Re-read verified
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">
            Audited {formatAuditTimestamp(audit.observedAt)} against Oz GitHub Development Standard v1.
          </p>
        </div>
        <a
          className="project-card-secondary-link text-xs font-semibold text-subtle hover:text-accent"
          href={`/projects/${encodeURIComponent(slug)}?standard=refresh#github-standard`}
        >
          Re-run audit
        </a>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted">GitHub Project</p>
          {audit.githubProject?.url ? (
            <a className="mt-1 block text-xs font-semibold hover:text-accent hover:underline" href={audit.githubProject.url} target="_blank" rel="noreferrer">
              {audit.githubProject.title}
            </a>
          ) : (
            <p className="mt-1 text-xs text-muted">Not safely resolved</p>
          )}
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted">Connected repositories</p>
          <p className="mt-1 text-xs font-semibold">
            {audit.repositories.length} {audit.repositories.length === 1 ? "repository" : "repositories"}
          </p>
          {audit.repositories.length > 0 ? (
            <p className="mt-1 text-[10px] leading-4 text-muted">
              {audit.repositories
                .map((item) => item.repository?.fullName ?? "Unresolved repository")
                .join(" · ")}
            </p>
          ) : null}
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-subtle">
        {audit.summary.conformant} conformant checks · {plan.summary.safe} safe changes ({plan.summary.executable} executable) · {plan.summary.manual} manual · {plan.summary.unsupported} unsupported
      </p>

      {nonconformant.length > 0 ? (
        <details className="mt-5 border-t border-line-soft pt-4" open={audit.status !== "conformant"} key={plan.fingerprint}>
          <summary className="cursor-pointer text-xs font-semibold text-subtle hover:text-foreground">
            Audit differences and migration plan
          </summary>
          <ul className="mt-3">
            {plan.steps.map((step) => <PlanStep key={step.id} step={step} />)}
          </ul>
        </details>
      ) : (
        <p className="mt-5 border-t border-line-soft pt-4 text-xs text-subtle">
          The supported, observable areas are conformant. Native workflow configuration limitations remain documented separately.
        </p>
      )}

      {conformant.length > 0 ? (
        <details className="mt-4 border-t border-line-soft pt-4">
          <summary className="cursor-pointer text-xs font-semibold text-subtle hover:text-foreground">
            Conformant checks ({conformant.length})
          </summary>
          <ul className="mt-3">
            {conformant.map((item) => (
              <li className="border-t border-line-soft py-2 text-xs text-muted first:border-t-0" key={item.id}>
                {item.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-5 border-t border-line-soft pt-4">
        <p className="text-xs font-semibold">Apply boundary</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          {plan.summary.safe} additive, server-generated {plan.summary.safe === 1 ? "change is" : "changes are"} safe; {plan.summary.executable} can run with the currently configured capability. Existing labels, Issue Status, Issue Priority, views, workflows, Releases, and repository files are never rewritten.
        </p>

        <ul className="mt-3 space-y-1 text-[10px] leading-4 text-muted">
          {Object.entries(audit.writeCapabilities).map(([capability, value]) => (
            <li key={capability}>
              {CAPABILITY_LABELS[capability]}: {value.available ? "configured" : `unavailable (${value.environmentVariable})`}
            </li>
          ))}
        </ul>

        {plan.summary.executable > 0 ? (
          <form action={action} className="mt-4 space-y-3">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="fingerprint" value={plan.fingerprint} />
            <label className="flex items-start gap-2 text-xs leading-5 text-subtle">
              <input className="mt-1" type="checkbox" required />
              <span>I understand that this explicit action will modify GitHub using only the configured per-capability credentials.</span>
            </label>
            <button
              className="workspace-button"
              type="submit"
              disabled={pending}
            >
              {pending ? "Re-reading and applying…" : "Apply approved safe changes"}
            </button>
          </form>
        ) : null}

        {plan.summary.safe > 0 && plan.summary.executable === 0 ? (
          <p className="mt-3 text-xs leading-5 text-muted">
            Apply unavailable: none of these safe changes has its matching write capability. Audit and planning remain read-only.
          </p>
        ) : null}
        {plan.summary.unavailable > 0 && plan.summary.executable > 0 ? (
          <p className="mt-3 text-xs leading-5 text-muted">
            {plan.summary.unavailable} safe {plan.summary.unavailable === 1 ? "change is" : "changes are"} unavailable and will be skipped because its matching credential is not configured.
          </p>
        ) : null}
        {state.message ? (
          <p className={`mt-3 text-xs leading-5 ${resultIsError ? "text-attention" : "text-ready"}`} role={resultIsError ? "alert" : "status"}>
            {state.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
