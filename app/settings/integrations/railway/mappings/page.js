import Link from "next/link";

import { AppShell } from "../../../../../components/app-shell.js";
import { RailwayMappingForm } from "../../../../../components/railway/railway-mapping-form.js";
import { observeRailwayConnectionHealth } from "../../../../../lib/health/providers/railway-connection.js";
import { listPortfolioProjects } from "../../../../../lib/projects/queries.js";
import { getRailwayIntegrationView } from "../../../../../lib/railway/connection.js";
import { buildRailwayMappingsView } from "../../../../../lib/railway/mappings.js";

export const dynamic = "force-dynamic";

const STATE_LABELS = {
  automatic: "Automatically mapped",
  manual: "Manually mapped",
  unmapped: "Unmapped",
  ambiguous: "Ambiguous",
};

function StatePill({ state }) {
  return (
    <span className="rounded-full border border-line px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
      {STATE_LABELS[state] ?? state}
    </span>
  );
}

function DeploymentSummary({ deployment }) {
  if (!deployment) {
    return <p className="text-xs text-muted">Deployment state available after mapping</p>;
  }
  return (
    <div>
      <p className="text-xs font-semibold capitalize text-subtle">
        Latest deployment · {deployment.status.replaceAll("_", " ")}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted">{deployment.reason}</p>
    </div>
  );
}

export default async function RailwayMappingsPage() {
  let projects = [];
  let integration = null;
  let observations = [];
  let unavailable = false;

  try {
    [projects, integration] = await Promise.all([
      listPortfolioProjects(),
      getRailwayIntegrationView(),
    ]);
    if (integration.connection?.connectionState === "connected") {
      observations = await observeRailwayConnectionHealth(projects).catch(
        () => [],
      );
    }
  } catch {
    unavailable = true;
  }

  const view = buildRailwayMappingsView({
    integration,
    projects,
    observations,
  });
  const projectOptions = projects.map(({ id, name, components }) => ({
    id,
    name,
    components: components.map(({ id: componentId, name: componentName }) => ({
      id: componentId,
      name: componentName,
    })),
  }));
  const connected = integration?.connection?.connectionState === "connected";

  return (
    <AppShell>
      <section className="mx-auto max-w-[1060px] px-5 py-10 sm:px-8 sm:py-12 lg:pb-24">
        <nav className="flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
          <Link className="hover:text-foreground" href="/settings">Settings</Link>
          <span aria-hidden="true">/</span>
          <span className="text-subtle">Railway mappings</span>
        </nav>
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">Railway</p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.025em]">Manage mappings</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-subtle">
              Associate discovered Railway services with ProjectDeck Projects and Components. These mappings affect ProjectDeck only; Railway is never modified.
            </p>
          </div>
          {connected ? (
            <form action="/api/integrations/railway/refresh?returnTo=mappings" method="post">
              <button className="rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-semibold hover:border-accent" type="submit">Refresh discovery</button>
            </form>
          ) : null}
        </div>

        {unavailable ? (
          <p className="mt-8 rounded-xl border border-line bg-surface p-4 text-sm text-subtle">Railway mappings are temporarily unavailable.</p>
        ) : !connected ? (
          <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
            <h2 className="text-base font-semibold">Railway is not connected</h2>
            <p className="mt-2 text-sm leading-6 text-subtle">Connect Railway from Settings before managing discovered resources.</p>
            <Link className="mt-4 inline-flex rounded-lg border border-line px-3.5 py-2 text-xs font-semibold hover:border-accent" href="/settings#railway">Return to Settings</Link>
          </div>
        ) : (
          <>
            {/* Provider discovery is read-only; mapping mutations below only update ProjectDeck-owned associations. */}
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-y border-line py-4 font-mono text-[11px] text-muted">
              <span>{view.counts.total} discovered</span>
              <span>{view.counts.mapped} mapped</span>
              <span>{view.counts.unmapped} unmapped</span>
              {view.counts.ambiguous > 0 ? <span>{view.counts.ambiguous} ambiguous</span> : null}
            </div>

            {view.resources.length === 0 ? (
              <p className="mt-8 rounded-xl border border-line bg-surface p-5 text-sm text-subtle">No Railway service environments were discovered.</p>
            ) : (
              <div className="mt-6 space-y-4">
                {view.resources.map((resource) => (
                  <article className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--card-shadow)]" key={resource.externalId}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h2 className="text-base font-semibold">{resource.projectName}</h2>
                          <StatePill state={resource.mappingState} />
                          {resource.association && !resource.association.affectsProjectHealth ? (
                            <span className="rounded-full border border-line-soft px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">Informational</span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm text-subtle">{resource.environmentName} · {resource.serviceName}</p>
                        {resource.sourceRepository ? (
                          <p className="mt-1 font-mono text-[10.5px] text-muted">GitHub · {resource.sourceRepository}</p>
                        ) : (
                          <p className="mt-1 text-xs text-muted">No source repository identity reported</p>
                        )}
                      </div>
                      <div className="max-w-md lg:text-right">
                        {resource.mappedProject ? (
                          <p className="text-xs leading-5 text-subtle">
                            {resource.mappingState === "automatic" ? "Exact repository match" : "Mapped"} → <span className="font-semibold text-foreground">{resource.mappedProject.name}</span>
                            {resource.mappedComponent ? ` · ${resource.mappedComponent.name}` : ""}
                          </p>
                        ) : resource.mappingState === "ambiguous" ? (
                          <p className="text-xs leading-5 text-subtle">More than one Project has the exact source repository. Choose explicitly.</p>
                        ) : (
                          <p className="text-xs leading-5 text-muted">Choose where this service belongs.</p>
                        )}
                        <div className="mt-2"><DeploymentSummary deployment={resource.deployment} /></div>
                      </div>
                    </div>
                    <RailwayMappingForm resource={resource} projects={projectOptions} />
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </AppShell>
  );
}
