import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "../../../../components/app-shell.js";
import { ProjectEditForm } from "../../../../components/projects/project-edit-form.js";
import {
  PROJECT_ACCENT_OPTIONS,
  PROJECT_EDIT_LIMITS,
  PROJECT_NEXT_MODE_OPTIONS,
  PROJECT_PHASE_OPTIONS,
} from "../../../../lib/projects/edit.js";
import { buildQuickLinks } from "../../../../lib/projects/workspace.js";
import { getProjectWorkspaceBySlug } from "../../../../lib/projects/queries.js";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({ params }) {
  const { slug } = await params;
  let project;

  try {
    project = await getProjectWorkspaceBySlug(slug);
  } catch {
    return (
      <AppShell workspaceName="Project">
        <section className="mx-auto max-w-[760px] px-5 py-12 sm:px-8">
          <h1 className="text-2xl font-semibold">Project editing unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-subtle">
            ProjectDeck could not reach its database. Your Project has not been changed.
          </p>
        </section>
      </AppShell>
    );
  }

  if (!project) {
    notFound();
  }

  const connectedResources = buildQuickLinks(project.resources);

  return (
    <AppShell workspaceName={project.name}>
      <section className="mx-auto max-w-[820px] px-5 py-10 sm:px-8 sm:py-12 lg:pb-24">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">
              Project settings
            </p>
            <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.025em]">
              Edit {project.name}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-subtle">
              Update ProjectDeck-owned context. GitHub and Railway observations remain read-only.
            </p>
          </div>
          <Link
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-accent"
            href={`/projects/${project.slug}`}
          >
            Back to Project
          </Link>
        </div>

        <ProjectEditForm
          project={project}
          accentOptions={PROJECT_ACCENT_OPTIONS}
          phaseOptions={PROJECT_PHASE_OPTIONS}
          nextModeOptions={PROJECT_NEXT_MODE_OPTIONS}
          limits={PROJECT_EDIT_LIMITS}
        />

        <section className="mt-12 border-t border-line pt-8" aria-labelledby="connected-resources-heading">
          <h2
            className="font-mono text-xs uppercase tracking-[0.14em] text-muted"
            id="connected-resources-heading"
          >
            Connected resources
          </h2>
          {connectedResources.length > 0 ? (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {connectedResources.map((resource) => (
                <li className="flex items-center justify-between gap-5 py-4" key={resource.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{resource.label}</p>
                    <p className="mt-1 font-mono text-[10px] capitalize text-muted">{resource.context}</p>
                  </div>
                  <a
                    className="shrink-0 text-xs font-semibold text-subtle hover:text-accent"
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open ↗
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted">No Resources linked to this Project.</p>
          )}
          <p className="mt-4 text-xs leading-5 text-muted">
            GitHub repositories are managed from Settings. Railway services are connected from the Project Overview.
          </p>
        </section>
      </section>
    </AppShell>
  );
}
