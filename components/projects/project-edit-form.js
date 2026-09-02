"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { updateProjectAction } from "../../app/projects/[slug]/edit/actions.js";

const INITIAL_STATE = { status: "idle", message: "", errors: {}, values: null };

function FieldError({ id, message }) {
  if (!message) {
    return null;
  }

  return (
    <p className="mt-2 text-xs font-medium text-attention" id={id}>
      {message}
    </p>
  );
}

function describedBy(helpId, errorId, error) {
  return [helpId, error ? errorId : null].filter(Boolean).join(" ") || undefined;
}

export function ProjectEditForm({
  project,
  accentOptions,
  attentionModeOptions,
  phaseOptions,
  nextModeOptions,
  limits,
}) {
  const [state, formAction, pending] = useActionState(
    updateProjectAction,
    INITIAL_STATE,
  );
  const values = state.values ?? project;
  const [attentionMode, setAttentionMode] = useState(
    values.needsAttention ? "force" : "automatic",
  );
  const [nextMode, setNextMode] = useState(
    values.nextAction ? "manual" : "automatic",
  );
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="mt-9">
      <input type="hidden" name="slug" value={project.slug} />

      {state.status === "error" ? (
        <div
          className="mb-7 rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-6 text-subtle"
          role="alert"
        >
          <span className="font-semibold text-foreground">Changes not saved. </span>
          {state.message}
        </div>
      ) : null}

      <div className="space-y-8">
        <fieldset className="space-y-6">
          <legend className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
            Project details
          </legend>

          <div>
            <label className="block text-sm font-semibold" htmlFor="project-name">
              Name
            </label>
            <input
              className="mt-2 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm"
              id="project-name"
              name="name"
              type="text"
              required
              maxLength={limits.name}
              defaultValue={values.name}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "project-name-error" : undefined}
            />
            <FieldError id="project-name-error" message={errors.name} />
          </div>

          <div>
            <label className="block text-sm font-semibold" htmlFor="project-tagline">
              Tagline <span className="font-normal text-muted">optional</span>
            </label>
            <input
              className="mt-2 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm"
              id="project-tagline"
              name="tagline"
              type="text"
              maxLength={limits.tagline}
              defaultValue={values.tagline ?? ""}
              aria-invalid={Boolean(errors.tagline)}
              aria-describedby={errors.tagline ? "project-tagline-error" : undefined}
            />
            <FieldError id="project-tagline-error" message={errors.tagline} />
          </div>

          <div>
            <label className="block text-sm font-semibold" htmlFor="project-phase">
              Phase
            </label>
            <select
              className="mt-2 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm"
              id="project-phase"
              name="phaseOverride"
              defaultValue={values.phaseOverride ?? ""}
              aria-invalid={Boolean(errors.phaseOverride)}
              aria-describedby={describedBy(
                "project-phase-help",
                "project-phase-error",
                errors.phaseOverride,
              )}
            >
              {phaseOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-5 text-muted" id="project-phase-help">
              Automatic uses read-only GitHub evidence. A named phase is an explicit override; attention remains separate.
            </p>
            <FieldError id="project-phase-error" message={errors.phaseOverride} />
          </div>
        </fieldset>

        <fieldset className="border-t border-line pt-8">
          <legend className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
            Attention
          </legend>
          <div className="mt-5">
            <label className="block text-sm font-semibold" htmlFor="attention-mode">
              Attention mode
            </label>
            <select
              className="mt-2 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm"
              id="attention-mode"
              name="attentionMode"
              value={attentionMode}
              onChange={(event) => setAttentionMode(event.target.value)}
              aria-invalid={Boolean(errors.attentionMode)}
              aria-describedby={errors.attentionMode ? "attention-mode-error" : "attention-mode-help"}
            >
              {attentionModeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-5 text-muted" id="attention-mode-help">
              Automatic uses Health and active high-priority bug evidence. Force Needs Attention is a manual override. Returning to Automatic clears the saved manual reason.
            </p>
            <FieldError id="attention-mode-error" message={errors.attentionMode} />
          </div>

          <div className={`mt-5 ${attentionMode === "force" ? "" : "hidden"}`}>
            <label className="block text-sm font-semibold" htmlFor="attention-summary">
              Manual reason <span className="font-normal text-muted">optional</span>
            </label>
            <textarea
              className="mt-2 min-h-24 w-full resize-y rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm leading-6"
              id="attention-summary"
              name="attentionSummary"
              maxLength={limits.attentionSummary}
              defaultValue={values.attentionSummary ?? ""}
              disabled={attentionMode !== "force"}
              placeholder="What currently requires intervention?"
              aria-invalid={Boolean(errors.attentionSummary)}
              aria-describedby={errors.attentionSummary ? "attention-summary-error" : undefined}
            />
            <FieldError id="attention-summary-error" message={errors.attentionSummary} />
          </div>
        </fieldset>

        <fieldset className="border-t border-line pt-8">
          <legend className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
            Next
          </legend>
          <div className="mt-5">
            <label className="block text-sm font-semibold" htmlFor="next-action-mode">
              Next action mode
            </label>
            <select
              className="mt-2 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm"
              id="next-action-mode"
              name="nextActionMode"
              value={nextMode}
              onChange={(event) => setNextMode(event.target.value)}
              aria-invalid={Boolean(errors.nextActionMode)}
              aria-describedby={errors.nextActionMode ? "next-action-mode-error" : "next-action-mode-help"}
            >
              {nextModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-5 text-muted" id="next-action-mode-help">
              Automatic selects from open GitHub Project Issues in In Progress, Verify, then Ready. Manual override always wins until cleared.
            </p>
            <FieldError id="next-action-mode-error" message={errors.nextActionMode} />
          </div>

          <div className={`mt-5 ${nextMode === "manual" ? "" : "hidden"}`}>
            <label className="block text-sm font-semibold" htmlFor="next-action">
              Manual Next action
            </label>
            <textarea
              className="mt-2 min-h-24 w-full resize-y rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm leading-6"
              id="next-action"
              name="nextAction"
              maxLength={limits.nextAction}
              defaultValue={values.nextAction ?? ""}
              disabled={nextMode !== "manual"}
              placeholder="What do you explicitly intend to do next?"
              aria-invalid={Boolean(errors.nextAction)}
              aria-describedby={describedBy(
                "next-action-help",
                "next-action-error",
                errors.nextAction,
              )}
            />
            <p className="mt-2 text-xs leading-5 text-muted" id="next-action-help">
              Leave this empty to clear the override and return to Automatic.
            </p>
            <FieldError id="next-action-error" message={errors.nextAction} />
          </div>
        </fieldset>

        <fieldset className="border-t border-line pt-8">
          <legend className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
            Accent
          </legend>
          <div className="mt-5 flex flex-wrap gap-3" aria-describedby={errors.accent ? "project-accent-error" : undefined}>
            {accentOptions.map((option) => (
              <label
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold hover:border-accent has-checked:border-accent"
                key={option.value}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="accent"
                  value={option.value}
                  defaultChecked={values.accent === option.value}
                />
                <span
                  className="h-3 w-3 rounded-full"
                  style={{
                    background: `oklch(var(--project-lightness) var(--project-chroma) ${option.value})`,
                  }}
                  aria-hidden="true"
                />
                {option.label}
              </label>
            ))}
          </div>
          <FieldError id="project-accent-error" message={errors.accent} />
        </fieldset>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-6">
        <Link
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-subtle hover:text-foreground"
          href={`/projects/${project.slug}`}
        >
          Cancel
        </Link>
        <button
          className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-85 disabled:cursor-wait disabled:opacity-60"
          type="submit"
          disabled={pending}
        >
          {pending ? "Saving…" : "Save Project"}
        </button>
      </div>
    </form>
  );
}
