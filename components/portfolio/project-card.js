import Link from "next/link";

import { buildProjectNextPresentation } from "../../lib/projects/portfolio.js";

export function ProjectMark({ card, size = "card" }) {
  const sizeClass = size === "continue" ? "project-mark-large" : "project-mark";

  return (
    <div className={sizeClass} aria-hidden="true">
      {card.mark}
    </div>
  );
}

function AttentionSummary({ card }) {
  if (!card.needsAttention) return null;

  const severity = card.attention.severity;
  const source = card.attention.source === "manual" ? "Manual" : "Automatic";
  const severityLabel = severity === "normal"
    ? null
    : severity.charAt(0).toUpperCase() + severity.slice(1);

  return (
    <section
      className="project-card-attention"
      data-severity={severity}
      aria-labelledby={`attention-${card.slug}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3
          className="font-mono text-[10px] font-bold uppercase tracking-[0.09em] text-attention"
          id={`attention-${card.slug}`}
        >
          Needs Attention
        </h3>
        <span className="font-mono text-[9px] uppercase tracking-wide text-muted">
          {[severityLabel, source].filter(Boolean).join(" · ")}
        </span>
      </div>
      <p
        className="project-card-attention-reason mt-1.5 text-[13px] font-semibold leading-5 text-subtle"
        title={card.attention.primary_reason}
      >
        {card.attention.primary_reason}
      </p>
    </section>
  );
}

function ProjectState({ card }) {
  return (
    <dl className="project-card-state" aria-label="Project state">
      <div
        className="project-card-state-item"
        title={card.phaseSource === "override" ? "Manual override" : card.phaseReason}
      >
        <dt className="project-card-state-label">Phase</dt>
        <dd className="project-card-state-value">
          <span className={`phase-dot phase-${card.phase}`} aria-hidden="true" />
          <span>{card.phaseLabel}</span>
          {card.phaseSource === "override" ? (
            <span className="project-card-state-note">Manual</span>
          ) : null}
        </dd>
      </div>
      <div className="project-card-state-item" title={card.health.reason}>
        <dt className="project-card-state-label">Health</dt>
        <dd className="project-card-state-value">
          <span className={`health-dot health-${card.health.status}`} aria-hidden="true" />
          <span>{card.health.label}</span>
        </dd>
      </div>
    </dl>
  );
}

function NextSummary({ card, next }) {
  const sourceLabel = next.isManual ? "Manual" : "Automatic";

  return (
    <section className="project-card-next" aria-labelledby={`next-${card.slug}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="project-next-mark" aria-hidden="true" />
        <h3 className="project-card-eyebrow" id={`next-${card.slug}`}>
          Next
        </h3>
        <span className="project-card-source">{sourceLabel}</span>
      </div>
      {next.issueUrl ? (
        <a
          className="project-card-next-title project-card-secondary-link hover:text-[var(--project-color)] hover:underline"
          href={next.issueUrl}
          target="_blank"
          rel="noreferrer"
          title={next.label}
          aria-label={`Open Next Issue for ${card.name}: ${next.label}`}
        >
          {next.label}
        </a>
      ) : (
        <p
          className={`project-card-next-title ${next.isSet ? "text-foreground" : "text-muted"}`}
          title={next.label}
        >
          {next.label}
        </p>
      )}
      {next.metaLabel ? (
        <p className="project-card-next-meta" title={next.metaLabel}>
          {next.metaLabel}
        </p>
      ) : null}
    </section>
  );
}

function ReleaseSummary({ card }) {
  if (!card.releaseSummary) return null;

  return (
    <div className="project-card-metadata-item">
      <dt className="project-card-eyebrow">Release</dt>
      <dd className="mt-1.5 min-w-0">
        <Link
          className="project-card-metadata-link project-card-secondary-link"
          href={card.releaseSummary.href}
          title={card.releaseSummary.description ?? card.releaseSummary.label}
          aria-label={`View Releases for ${card.name}: ${card.releaseSummary.label}`}
        >
          {card.releaseSummary.label}
        </Link>
      </dd>
    </div>
  );
}

function IssueSummary({ card }) {
  if (!card.issueSummary) return null;

  return (
    <div className="project-card-metadata-item">
      <dt className="project-card-eyebrow">Issues</dt>
      <dd
        className="mt-1.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[11px] leading-5"
        title={card.issueSummary.description ?? undefined}
      >
        {card.issueSummary.segments.map((segment, index) => (
          <span className="contents" key={segment.key}>
            {index > 0 ? (
              <span className="text-muted opacity-45" aria-hidden="true">·</span>
            ) : null}
            <Link
              className={`project-card-secondary-link hover:text-[var(--project-color)] hover:underline ${
                segment.key === "bugs"
                  ? "font-bold text-foreground"
                  : "font-medium text-muted"
              }`}
              href={segment.href}
              aria-label={
                segment.key === "bugs"
                  ? `View Bugs for ${card.name}: ${segment.label}`
                  : `View open Issues for ${card.name}: ${segment.label}`
              }
            >
              {segment.label}
            </Link>
          </span>
        ))}
      </dd>
    </div>
  );
}

function LatestCommitSummary({ card, lastWorkText }) {
  if (!card.latestCommit?.visible) {
    return lastWorkText ? (
      <p className="project-card-last-work" title={lastWorkText}>{lastWorkText}</p>
    ) : null;
  }

  const relative = card.latestCommit.relativeLabel
    ? ` · ${card.latestCommit.relativeLabel}`
    : "";
  const subject = card.latestCommit.scopeLabel
    ? `${card.latestCommit.scopeLabel} · ${card.latestCommit.subject}`
    : card.latestCommit.subject;

  return (
    <section className="project-card-latest" aria-labelledby={`latest-${card.slug}`}>
      <h3 className="project-card-eyebrow" id={`latest-${card.slug}`}>
        Latest commit{relative}
      </h3>
      {card.latestCommit.commit?.url ? (
        <a
          className="project-card-latest-subject project-card-secondary-link hover:text-[var(--project-color)] hover:underline"
          href={card.latestCommit.commit.url}
          target="_blank"
          rel="noreferrer"
          title={subject}
          aria-label={`Open latest commit for ${card.name}: ${subject}`}
        >
          {subject}
        </a>
      ) : (
        <p className="project-card-latest-subject text-muted" title={subject}>
          {subject}
        </p>
      )}
    </section>
  );
}

export function ProjectCard({ card }) {
  const next = buildProjectNextPresentation(card);
  const lastWorkText = card.lastMeaningfulWorkSummary
    ? `${card.lastWorkedLabel ? `${card.lastWorkedLabel} — ` : ""}${card.lastMeaningfulWorkSummary}`
    : card.lastWorkedLabel
      ? `Last worked ${card.lastWorkedLabel}`
      : null;
  const titleId = `project-card-${card.slug}`;

  return (
    <article
      className="project-card group"
      style={{ "--project-hue": card.accentHue }}
      aria-labelledby={titleId}
    >
      <Link
        className="project-card-open"
        href={card.workspaceHref}
        aria-label={`Open ${card.name} Workspace`}
      >
        <span className="sr-only">Open {card.name} Workspace</span>
      </Link>
      <span className="project-accent-line" aria-hidden="true" />

      <header className="project-card-identity">
        <ProjectMark card={card} />
        <div className="min-w-0">
          <h2 className="project-card-name" id={titleId} title={card.name}>
            {card.name}
          </h2>
          {card.tagline ? (
            <p className="project-card-tagline" title={card.tagline}>
              {card.tagline}
            </p>
          ) : null}
        </div>
      </header>

      <ProjectState card={card} />
      <AttentionSummary card={card} />
      <NextSummary card={card} next={next} />

      {card.releaseSummary || card.issueSummary ? (
        <dl className="project-card-metadata" aria-label="Portfolio metadata">
          <ReleaseSummary card={card} />
          <IssueSummary card={card} />
        </dl>
      ) : null}

      <LatestCommitSummary card={card} lastWorkText={lastWorkText} />
    </article>
  );
}
