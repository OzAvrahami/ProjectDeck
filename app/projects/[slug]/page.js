import { notFound } from "next/navigation";

import { AppShell } from "../../../components/app-shell.js";
import { ProjectMark } from "../../../components/portfolio/project-card.js";
import { buildProjectCardViewModel } from "../../../lib/projects/portfolio.js";
import { getProjectBySlug } from "../../../lib/projects/queries.js";

export const dynamic = "force-dynamic";

export default async function ProjectIdentityPage({ params }) {
  const { slug } = await params;
  let project;

  try {
    project = await getProjectBySlug(slug);
  } catch {
    return (
      <AppShell workspaceName="Project">
        <section className="mx-auto max-w-[760px] px-5 py-12 sm:px-8">
          <h1 className="text-2xl font-semibold">Project unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-subtle">
            ProjectDeck could not reach its database. Try opening this Project
            again shortly.
          </p>
        </section>
      </AppShell>
    );
  }

  if (!project) {
    notFound();
  }

  const card = buildProjectCardViewModel({ ...project, components: [] });

  return (
    <AppShell workspaceName={card.name}>
      <section
        className="mx-auto max-w-[760px] px-5 py-12 sm:px-8"
        style={{ "--project-hue": card.accentHue }}
      >
        <div className="flex items-center gap-4">
          <ProjectMark card={card} size="continue" />
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-[-0.025em]">
                {card.name}
              </h1>
              <span className="flex items-center gap-1.5 text-xs text-subtle">
                <span
                  className={`lifecycle-dot lifecycle-${card.lifecycleState}`}
                  aria-hidden="true"
                />
                {card.lifecycleLabel}
              </span>
              {card.needsAttention ? (
                <span className="attention-pill">Needs Attention</span>
              ) : null}
            </div>
            {card.tagline ? (
              <p className="mt-1.5 text-sm text-subtle">{card.tagline}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-10 rounded-xl border border-line bg-surface p-6 shadow-[var(--card-shadow)]">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
            Next
          </p>
          <p className="mt-2 text-lg font-semibold">
            {card.nextAction ?? "No next action set"}
          </p>
        </div>

        <div className="mt-8 border-t border-line pt-6">
          <p className="text-sm font-semibold">Project Workspace</p>
          <p className="mt-2 text-sm leading-6 text-subtle">
            The complete Project Workspace is intentionally deferred to the
            next implementation slice. This stable route already reflects the
            real Project identity and user-owned Next action.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
