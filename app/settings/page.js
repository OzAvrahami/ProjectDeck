import Link from "next/link";

import { AppShell } from "../../components/app-shell.js";
import { isGitHubConfigured } from "../../lib/github/index.js";
import { listPortfolioProjects } from "../../lib/projects/queries.js";
import { isRailwayConfigured } from "../../lib/railway/index.js";
import { isVercelConfigured } from "../../lib/vercel/index.js";
import {
  buildIntegrationStatus,
  connectedResourceLabel,
} from "../../lib/settings/integrations.js";

export const dynamic = "force-dynamic";

function ConfigurationState({ configured }) {
  return (
    <span className="flex items-center gap-2 text-xs font-semibold text-subtle">
      <span
        className={`h-1.5 w-1.5 rounded-full ${configured ? "bg-ready" : "bg-muted"}`}
        aria-hidden="true"
      />
      {configured ? "Configured" : "Configuration required"}
    </span>
  );
}

function IntegrationRow({
  name,
  configured,
  countLabel,
  description,
  actionHref,
  actionLabel,
}) {
  return (
    <article className="border-t border-line py-6 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-base font-semibold">{name}</h3>
            <ConfigurationState configured={configured} />
          </div>
          <p className="mt-2 font-mono text-[11px] text-muted">{countLabel}</p>
          <p className="mt-3 text-sm leading-6 text-subtle">{description}</p>
        </div>
        <Link
          className="inline-flex w-fit shrink-0 rounded-lg border border-line bg-background px-4 py-2.5 text-sm font-semibold hover:border-accent"
          href={actionHref}
        >
          {actionLabel}
        </Link>
      </div>
    </article>
  );
}

export default async function SettingsPage() {
  let resources = [];
  let connectionsAvailable = true;

  try {
    const projects = await listPortfolioProjects();
    resources = projects.flatMap((project) => project.resources);
  } catch {
    connectionsAvailable = false;
  }

  const status = buildIntegrationStatus({
    resources,
    githubConfigured: isGitHubConfigured(),
    railwayConfigured: isRailwayConfigured(),
    vercelConfigured: isVercelConfigured(),
    connectionsAvailable,
  });

  return (
    <AppShell>
      <section className="mx-auto max-w-[820px] px-5 py-10 sm:px-8 sm:py-12 lg:pb-24">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">
          ProjectDeck
        </p>
        <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.025em]">
          Settings
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-subtle">
          See which sources ProjectDeck can use and where their Project
          connections are managed. Secret values never appear here.
        </p>

        <section className="mt-10" aria-labelledby="integrations-heading">
          <h2
            className="font-mono text-xs uppercase tracking-[0.14em] text-muted"
            id="integrations-heading"
          >
            Integrations
          </h2>
          <div className="mt-4 rounded-2xl border border-line bg-surface p-5 shadow-[var(--card-shadow)] sm:p-6">
            <IntegrationRow
              name="GitHub"
              configured={status.github.configured}
              countLabel={connectedResourceLabel(
                status.github.connectedCount,
                "repository",
              )}
              description="Scan repositories, import new Projects, or review which repositories are already connected."
              actionHref="/setup/github"
              actionLabel={
                status.github.connectedCount > 0
                  ? "Manage repositories"
                  : "Scan GitHub"
              }
            />
            <IntegrationRow
              name="Vercel"
              configured={status.vercel.configured}
              countLabel={connectedResourceLabel(
                status.vercel.connectedCount,
                "deployment resource",
              )}
              description="Vercel production monitoring is configured explicitly from the relevant Project Workspace using a stable Project ID."
              actionHref="/projects"
              actionLabel="Manage from Projects"
            />
            <IntegrationRow
              name="Railway"
              configured={status.railway.configured}
              countLabel={connectedResourceLabel(
                status.railway.connectedCount,
                "runtime resource",
              )}
              description="Railway services are connected explicitly from the relevant Project Workspace, with optional Component scope."
              actionHref="/projects"
              actionLabel="Manage from Projects"
            />
          </div>
          {!status.connectionsAvailable ? (
            <p className="mt-3 text-xs leading-5 text-muted">
              Connection counts are temporarily unavailable because ProjectDeck
              could not reach its database. Provider configuration status is
              still shown independently.
            </p>
          ) : null}
        </section>

        <section className="mt-10 border-t border-line pt-7" aria-labelledby="appearance-heading">
          <h2
            className="font-mono text-xs uppercase tracking-[0.14em] text-muted"
            id="appearance-heading"
          >
            Appearance
          </h2>
          <p className="mt-3 text-sm leading-6 text-subtle">
            Use the sun or moon control in the header to switch between Light
            and Dark mode. Your choice is kept in this browser.
          </p>
        </section>
      </section>
    </AppShell>
  );
}
