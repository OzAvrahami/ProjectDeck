import Link from "next/link";

import { ADD_PROJECTS_HREF } from "../../lib/projects/navigation.js";
import { ProjectCard, ProjectMark } from "./project-card.js";

function PortfolioHeader({ summary }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.025em]">
          Good to see you, Oz
        </h1>
        <p className="mt-2 font-mono text-[13px] text-muted">{summary}</p>
      </div>
      <Link
        className="inline-flex rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:opacity-85"
        href={ADD_PROJECTS_HREF}
      >
        + Add projects
      </Link>
    </div>
  );
}

function ContinueCard({ card }) {
  const nextLabel =
    card.next.source === "none"
      ? "No clear next action"
      : card.next.source === "unavailable"
        ? "Unavailable"
        : card.next.action;

  return (
    <section
      className="continue-card"
      style={{ "--project-hue": card.accentHue }}
      aria-labelledby="continue-heading"
    >
      <span className="project-accent-line" aria-hidden="true" />
      <ProjectMark card={card} size="continue" />
      <div className="min-w-0 flex-1">
        <p
          className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted"
          id="continue-heading"
        >
          Continue where you left off
        </p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="text-lg font-semibold">{card.name}</h2>
          <span className="text-[13px] text-muted">
            {card.lastWorkedLabel}
          </span>
        </div>
        {card.lastMeaningfulWorkSummary ? (
          <p className="mt-1 text-sm leading-6 text-subtle">
            {card.lastMeaningfulWorkSummary}
          </p>
        ) : null}
        <p className="mt-1 text-sm leading-6">
          <span className="text-muted">Next: </span>
          {nextLabel}
        </p>
      </div>
      <Link
        className="project-accent-button"
        href={card.workspaceHref}
      >
        Continue →
      </Link>
    </section>
  );
}

export function PortfolioHome({ portfolio }) {
  return (
    <section className="mx-auto max-w-[1160px] px-5 py-10 sm:px-8 sm:py-12 lg:pb-24">
      <PortfolioHeader summary={portfolio.summary.label} />

      {portfolio.continueCard ? (
        <div className="mt-8">
          <ContinueCard card={portfolio.continueCard} />
        </div>
      ) : null}

      <div
        className={`grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-[18px] ${
          portfolio.continueCard ? "mt-10" : "mt-8"
        }`}
      >
        {portfolio.cards.map((card) => (
          <ProjectCard card={card} key={card.id} />
        ))}
      </div>
    </section>
  );
}

export function PortfolioEmptyState() {
  return (
    <section className="mx-auto max-w-[1160px] px-5 py-10 sm:px-8 sm:py-12">
      <PortfolioHeader summary="0 projects" />
      <div className="mt-10 max-w-2xl rounded-2xl border border-line bg-surface px-6 py-12 text-center shadow-[var(--card-shadow)] sm:px-10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-background font-mono text-sm font-semibold text-muted">
          PD
        </div>
        <h2 className="mt-5 text-xl font-semibold">No Projects yet</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-subtle">
          Import repositories from GitHub, then group them into the products
          you actually manage.
        </p>
      </div>
    </section>
  );
}

export function PortfolioErrorState() {
  return (
    <section className="mx-auto max-w-[1160px] px-5 py-10 sm:px-8 sm:py-12">
      <h1 className="text-[28px] font-semibold tracking-[-0.025em]">
        ProjectDeck
      </h1>
      <div className="mt-8 max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-[var(--card-shadow)]">
        <p className="font-semibold">Portfolio temporarily unavailable</p>
        <p className="mt-2 text-sm leading-6 text-subtle">
          ProjectDeck could not reach its database. Your Projects have not been
          replaced with an empty portfolio.
        </p>
        <Link
          className="mt-5 inline-flex rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-accent"
          href="/"
        >
          Try again
        </Link>
      </div>
    </section>
  );
}
