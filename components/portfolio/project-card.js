import Link from "next/link";
import { Fragment } from "react";

import { buildProjectNextPresentation } from "../../lib/projects/portfolio.js";

export function ProjectMark({ card, size = "card" }) {
  const sizeClass = size === "continue" ? "project-mark-large" : "project-mark";

  return (
    <div className={sizeClass} aria-hidden="true">
      {card.mark}
    </div>
  );
}

export function ProjectCard({ card }) {
  const next = buildProjectNextPresentation(card);
  const lastWorkText = card.lastMeaningfulWorkSummary
    ? `${card.lastWorkedLabel ? `${card.lastWorkedLabel} — ` : ""}${card.lastMeaningfulWorkSummary}`
    : card.lastWorkedLabel
      ? `Last worked ${card.lastWorkedLabel}`
      : card.recentActivity
        ? `Recent: ${card.recentActivity.message}`
        : null;
  const metadata = [
    card.releaseSummary
      ? { key: "release", label: card.releaseSummary.label }
      : null,
    card.issueSummary
      ? {
          key: "issues",
          label: card.issueSummary.label,
          title: card.issueSummary.description,
        }
      : null,
    card.components.length > 0
      ? {
          key: "components",
          label: card.components.map((component) => component.name).join(" · "),
        }
      : null,
  ].filter(Boolean);

  return (
    <article
      className="project-card group"
      style={{ "--project-hue": card.accentHue }}
    >
      <Link
        className="project-card-open"
        href={card.workspaceHref}
        aria-label={`Open ${card.name}`}
      >
        <span className="sr-only">Open {card.name}</span>
      </Link>
      <span className="project-accent-line" aria-hidden="true" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProjectMark card={card} />
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">
              {card.name}
            </h2>
            {card.tagline ? (
              <p className="mt-1 text-[13px] leading-5 text-subtle">
                {card.tagline}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-1.5 text-xs text-subtle">
            <span
              className={`phase-dot phase-${card.phase}`}
              aria-hidden="true"
            />
            <span
              title={
                card.phaseSource === "override"
                  ? "Manual override"
                  : card.phaseReason
              }
            >
              {card.phaseLabel}
              {card.phaseSource === "override" ? (
                <span className="ml-1 font-mono text-[9px] uppercase tracking-wide text-muted">
                  Manual
                </span>
              ) : null}
            </span>
          </div>
          {card.needsAttention ? (
            <span className="attention-pill">Needs Attention</span>
          ) : null}
        </div>
      </div>

      {card.needsAttention ? (
        <p className="-mt-3 text-xs font-medium leading-5 text-attention">
          {card.attention.primary_reason}
        </p>
      ) : null}

      <div>
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="project-next-mark" aria-hidden="true" />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
            Next
          </span>
          {next.isManual ? (
            <span className="font-mono text-[9px] uppercase tracking-wide text-muted">
              Manual
            </span>
          ) : null}
        </div>
        {next.issueUrl ? (
          <a
            className="project-card-secondary-link block text-[15.5px] font-semibold leading-[1.45] hover:text-[var(--project-color)] hover:underline"
            href={next.issueUrl}
            target="_blank"
            rel="noreferrer"
          >
            {next.label}
          </a>
        ) : (
          <p
            className={`text-[15.5px] font-semibold leading-[1.45] ${
              next.isSet ? "text-foreground" : "text-muted"
            }`}
          >
            {next.label}
          </p>
        )}
        {next.metaLabel ? (
          <p className="mt-1.5 font-mono text-[10.5px] leading-5 text-muted">
            {next.metaLabel}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2 font-mono text-[10.5px] text-muted">
        <span className="uppercase tracking-[0.08em]">Health</span>
        <span
          className={`health-dot health-${card.health.status}`}
          aria-hidden="true"
        />
        <span className="font-semibold text-subtle" title={card.health.reason}>
          {card.health.label}
        </span>
      </div>

      {metadata.length > 0 ? (
        <p className="flex flex-wrap items-center gap-x-2 font-mono text-xs leading-5 text-muted">
          {metadata.map((item, index) => (
            <Fragment key={item.key}>
              {index > 0 ? (
                <span className="opacity-45" aria-hidden="true">
                  ·
                </span>
              ) : null}
              <span title={item.title ?? undefined}>{item.label}</span>
            </Fragment>
          ))}
        </p>
      ) : null}

      {lastWorkText ? (
        <p className="mt-auto border-t border-line-soft pt-3 text-xs leading-5 text-muted">
          {lastWorkText}
        </p>
      ) : null}
    </article>
  );
}
