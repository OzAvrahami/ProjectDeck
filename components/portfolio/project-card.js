import Link from "next/link";

export function ProjectMark({ card, size = "card" }) {
  const sizeClass = size === "continue" ? "project-mark-large" : "project-mark";

  return (
    <div className={sizeClass} aria-hidden="true">
      {card.mark}
    </div>
  );
}

export function ProjectCard({ card }) {
  const lastWorkText = card.lastMeaningfulWorkSummary
    ? `${card.lastWorkedLabel ? `${card.lastWorkedLabel} — ` : ""}${card.lastMeaningfulWorkSummary}`
    : card.lastWorkedLabel
      ? `Last worked ${card.lastWorkedLabel}`
      : null;

  return (
    <Link
      className="project-card group"
      href={`/projects/${card.slug}`}
      style={{ "--project-hue": card.accentHue }}
      aria-label={`Open ${card.name}`}
    >
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
              className={`lifecycle-dot lifecycle-${card.lifecycleState}`}
              aria-hidden="true"
            />
            <span>{card.lifecycleLabel}</span>
          </div>
          {card.needsAttention ? (
            <span className="attention-pill">Needs Attention</span>
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="project-next-mark" aria-hidden="true" />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
            Next
          </span>
        </div>
        <p
          className={`text-[15.5px] font-semibold leading-[1.45] ${
            card.nextAction ? "text-foreground" : "text-muted"
          }`}
        >
          {card.nextAction ?? "No next action set"}
          {card.nextAction ? (
            <span className="project-accent-text"> →</span>
          ) : null}
        </p>
      </div>

      {card.components.length > 0 ? (
        <p className="font-mono text-xs leading-5 text-muted">
          {card.components.map((component) => component.name).join(" · ")}
        </p>
      ) : null}

      {lastWorkText ? (
        <p className="mt-auto border-t border-line-soft pt-3 text-xs leading-5 text-muted">
          {lastWorkText}
        </p>
      ) : null}
    </Link>
  );
}
