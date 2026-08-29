import Link from "next/link";

import { AppShell } from "../../components/app-shell.js";
import { isGitHubConfigured } from "../../lib/github/index.js";
import { listPortfolioProjects } from "../../lib/projects/queries.js";
import { getRailwayIntegrationView } from "../../lib/railway/connection.js";
import { isRailwayOAuthConfigured } from "../../lib/railway/oauth.js";
import { isVercelConfigured } from "../../lib/vercel/index.js";
import {
  buildIntegrationStatus,
  connectedResourceLabel,
} from "../../lib/settings/integrations.js";

export const dynamic = "force-dynamic";

function ConfigurationState({ configured, label = null }) {
  return (
    <span className="flex items-center gap-2 text-xs font-semibold text-subtle">
      <span
        className={`h-1.5 w-1.5 rounded-full ${configured ? "bg-ready" : "bg-muted"}`}
        aria-hidden="true"
      />
      {label ?? (configured ? "Configured" : "Configuration required")}
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

function RailwayIntegration({ integration, configured }) {
  const connection = integration?.connection ?? null;
  const connected = connection?.connectionState === "connected";
  const reconnectRequired = connection?.connectionState === "reconnect_required";
  const workspaces = connection?.selectedWorkspaces ?? [];

  return (
    <article className="border-t border-line py-6 last:pb-0" id="railway">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-base font-semibold">Railway</h3>
            <ConfigurationState
              configured={connected}
              label={connected ? "Connected" : reconnectRequired ? "Reconnect required" : "Not connected"}
            />
          </div>
          <p className="mt-2 font-mono text-[11px] text-muted">
            {connected
              ? `${integration.counts.projects} projects · ${integration.counts.services} services discovered`
              : reconnectRequired
                ? "Connection requires authorization"
                : "Not connected"}
          </p>
          <p className="mt-3 text-sm leading-6 text-subtle">
            Connect once with read-only workspace access. ProjectDeck discovers
            Railway projects, production environments, services, and deployment
            state across the portfolio.
          </p>
          {connected ? (
            <>
              <p className="mt-3 text-xs text-subtle">
                {workspaces.length === 1 ? "Workspace" : "Workspaces"}: {workspaces.map(({ name }) => name).join(", ") || "Selected in Railway"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {integration.associations.length} mapped · {integration.unmapped.length} unmapped service environments
              </p>
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {connected ? (
            <>
              <form action="/api/integrations/railway/refresh" method="post">
                <button className="rounded-lg border border-line bg-background px-3.5 py-2 text-xs font-semibold hover:border-accent" type="submit">Refresh discovery</button>
              </form>
              <Link className="rounded-lg border border-line bg-background px-3.5 py-2 text-xs font-semibold hover:border-accent" href="/projects">Manage mappings</Link>
              <a className="rounded-lg border border-line bg-background px-3.5 py-2 text-xs font-semibold hover:border-accent" href="/api/integrations/railway/connect">Reconnect</a>
              <form action="/api/integrations/railway/disconnect" method="post">
                <button className="rounded-lg border border-line bg-background px-3.5 py-2 text-xs font-semibold text-muted hover:border-attention" type="submit">Disconnect</button>
              </form>
            </>
          ) : configured ? (
            <a className="inline-flex rounded-lg border border-line bg-background px-4 py-2.5 text-sm font-semibold hover:border-accent" href="/api/integrations/railway/connect">
              {reconnectRequired ? "Reconnect Railway" : "Connect Railway"}
            </a>
          ) : (
            <span className="rounded-lg border border-line px-4 py-2.5 text-xs text-muted">OAuth configuration required</span>
          )}
        </div>
      </div>
      {connected && integration.unmapped.length > 0 ? (
        <div className="mt-5 rounded-xl border border-line-soft bg-background p-4">
          <p className="text-xs font-semibold">Unmapped Railway resources</p>
          <ul className="mt-2 space-y-1 font-mono text-[10.5px] text-muted">
            {integration.unmapped.slice(0, 8).map((resource) => (
              <li key={resource.externalId}>{resource.projectName} · {resource.environmentName} · {resource.serviceName}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-subtle">Open the matching Project Workspace to associate a discovered service explicitly.</p>
        </div>
      ) : null}
    </article>
  );
}

export default async function SettingsPage({ searchParams }) {
  let resources = [];
  let connectionsAvailable = true;
  let railwayIntegration = null;

  try {
    const [projects, integration] = await Promise.all([
      listPortfolioProjects(),
      getRailwayIntegrationView(),
    ]);
    resources = projects.flatMap((project) => project.resources);
    railwayIntegration = integration;
  } catch {
    connectionsAvailable = false;
  }

  const status = buildIntegrationStatus({
    resources,
    githubConfigured: isGitHubConfigured(),
    railwayConfigured: railwayIntegration?.connection?.connectionState === "connected",
    vercelConfigured: isVercelConfigured(),
    connectionsAvailable,
  });
  const query = await searchParams;
  const railwayMessage = {
    connected: "Railway connected and resources discovered.",
    refreshed: "Railway discovery refreshed.",
    disconnected: "Railway disconnected. Existing mappings were preserved.",
    configuration_required: "Railway OAuth server configuration is incomplete.",
    oauth_rejected: "Railway authorization was not completed.",
    connection_failed: "Railway connection could not be completed.",
    refresh_failed: "Railway discovery could not be refreshed; reconnect if the problem continues.",
  }[query?.railway];

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
            {railwayMessage ? (
              <p className="mb-5 rounded-lg border border-line bg-background px-3 py-2 text-xs leading-5 text-subtle" role="status">{railwayMessage}</p>
            ) : null}
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
            <RailwayIntegration integration={railwayIntegration} configured={isRailwayOAuthConfigured()} />
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
