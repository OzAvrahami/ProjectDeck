"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { ProjectCard } from "../portfolio/project-card.js";
import { filterProjectCards } from "../../lib/projects/portfolio.js";

const LIFECYCLES = [
  ["all", "All"],
  ["planning", "Planning"],
  ["active", "Active"],
  ["stable", "Stable"],
  ["paused", "Paused"],
  ["completed", "Completed"],
  ["archived", "Archived"],
];

export function ProjectsView({ cards }) {
  const [query, setQuery] = useState("");
  const [lifecycle, setLifecycle] = useState("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const visibleCards = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return filterProjectCards(cards, {
      query: needle,
      lifecycle,
      attentionOnly,
    });
  }, [attentionOnly, cards, lifecycle, query]);

  if (cards.length === 0) {
    return (
      <section className="mx-auto max-w-[1160px] px-5 py-10 sm:px-8 sm:py-12">
        <h1 className="text-[28px] font-semibold tracking-[-0.025em]">Projects</h1>
        <div className="mt-8 max-w-2xl rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <p className="font-semibold">No Projects yet</p>
          <p className="mt-2 text-sm leading-6 text-subtle">
            Import repositories from GitHub to create your first Project candidates.
          </p>
          <Link className="mt-6 inline-flex rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background" href="/setup/github">
            Import from GitHub →
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1160px] px-5 py-10 sm:px-8 sm:py-12 lg:pb-24">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.025em]">Projects</h1>
          <p className="mt-2 text-sm leading-6 text-subtle">
            Your complete ProjectDeck portfolio.
          </p>
        </div>
        <p className="font-mono text-xs text-muted">
          {visibleCards.length} of {cards.length}
        </p>
      </div>

      <div className="mt-8 rounded-xl border border-line bg-surface p-4 shadow-[var(--card-shadow)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full lg:max-w-sm">
            <span className="sr-only">Search Projects</span>
            <input
              className="w-full rounded-lg border border-line bg-background px-4 py-2.5 text-sm placeholder:text-muted focus:border-accent"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Projects"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-subtle">
            <input
              type="checkbox"
              checked={attentionOnly}
              onChange={(event) => setAttentionOnly(event.target.checked)}
            />
            Needs Attention only
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Lifecycle filter">
          {LIFECYCLES.map(([value, label]) => (
            <button
              className={`filter-chip ${lifecycle === value ? "filter-chip-active" : ""}`}
              key={value}
              type="button"
              onClick={() => setLifecycle(value)}
              aria-pressed={lifecycle === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visibleCards.length > 0 ? (
        <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-[18px]">
          {visibleCards.map((card) => (
            <ProjectCard card={card} key={card.id} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <p className="font-semibold">No Projects match these filters</p>
          <p className="mt-2 text-sm text-subtle">
            Adjust the search or lifecycle selection.
          </p>
        </div>
      )}
    </section>
  );
}
