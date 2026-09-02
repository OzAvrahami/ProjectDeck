import Link from "next/link";

import { ActivityRows } from "../github/activity-view.js";
import { ProjectMark } from "../portfolio/project-card.js";
import { WORKSPACE_TABS } from "../../lib/projects/navigation.js";
import {
  buildProjectNextPresentation,
  formatRelativeTime,
} from "../../lib/projects/portfolio.js";
import {
  buildQuickLinks,
  listDocumentationResources,
} from "../../lib/projects/workspace.js";
import {
  associateRailwayResourceAction,
  updateHealthMonitorAction,
  updateRailwayAssociationAction,
} from "../../app/projects/[slug]/actions.js";
import { RAILWAY_MAPPINGS_PATH } from "../../lib/railway/routes.js";
import { HealthMonitorForm } from "./health-monitor-form.js";

const GITHUB_FAILURE_LABELS = {
  missing_token: "GitHub is not configured",
  authentication: "GitHub authentication failed",
  permission: "GitHub permission is missing",
  rate_limit: "GitHub rate limit reached",
  repository_unavailable: "Repository unavailable",
  invalid_identity: "Repository identity could not be verified",
  provider: "GitHub temporarily unavailable",
};

function ProviderNote({ summary, subject }) {
  if (!summary || summary.failedRepositoryCount === 0) {
    return null;
  }

  const reasons = [...new Set(summary.failures.map(
    (failure) => GITHUB_FAILURE_LABELS[failure.code] ?? "GitHub unavailable",
  ))];

  return (
    <p className="mb-4 rounded-lg border border-line bg-background px-3 py-2 text-xs leading-5 text-subtle">
      {subject} is {summary.status === "partial" ? "partially available" : "unavailable"}. {reasons.join(" · ")}
    </p>
  );
}

function WorkspaceIssues({ project }) {
  const summary = project.githubSummary.issues;

  return (
    <WorkspaceSection title="Issues" description="Open GitHub Issues connected to this Project.">
      <ProviderNote summary={summary} subject="Issues" />
      {summary.items.length > 0 ? (
        <div className="border-b border-line">
          {summary.items.map((issue) => (
            <article className="border-t border-line py-4" key={issue.id}>
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-muted">
                    {issue.component?.name ? `${issue.component.name} · ` : ""}{issue.repository.fullName} · #{issue.number}
                  </p>
                  <a className="mt-2 block text-[15px] font-medium leading-6 hover:text-accent hover:underline" href={issue.url} target="_blank" rel="noreferrer">
                    {issue.title}
                  </a>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  Updated {formatRelativeTime(issue.updatedAt) ?? "time unknown"}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <WorkspaceEmpty
          title={summary.status === "unavailable" ? "Issues unavailable" : "No open Issues"}
          message={summary.status === "complete" ? "Every connected repository was checked successfully." : "No verified open Issues are available."}
        />
      )}
    </WorkspaceSection>
  );
}

function WorkspaceReleases({ project }) {
  const summary = project.githubSummary.releases;

  return (
    <WorkspaceSection title="Releases" description="Published GitHub Releases with repository scope preserved.">
      <ProviderNote summary={summary} subject="Releases" />
      {summary.items.length > 0 ? (
        <div className="border-b border-line">
          {summary.items.map((release) => (
            <article className="border-t border-line py-4" key={release.id}>
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="font-mono text-[11px] text-muted">
                    {release.component?.name ? `${release.component.name} · ` : ""}{release.repository.fullName}
                  </p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-3">
                    <a className="font-mono text-sm font-semibold hover:text-accent hover:underline" href={release.url} target="_blank" rel="noreferrer">{release.tagName}</a>
                    {release.name && release.name !== release.tagName ? <span className="text-sm text-subtle">{release.name}</span> : null}
                    {release.prerelease ? <span className="font-mono text-[11px] text-muted">Prerelease</span> : null}
                  </div>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted">{formatRelativeTime(release.publishedAt) ?? "Date unknown"}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <WorkspaceEmpty
          title={summary.status === "unavailable" ? "Releases unavailable" : "No published Releases"}
          message={summary.status === "complete" ? "Connected repositories were checked; ordinary Git tags are not included." : "No verified published Release is available."}
        />
      )}
    </WorkspaceSection>
  );
}

function WorkspaceActivity({ project }) {
  const summary = project.githubSummary.activity;

  return (
    <WorkspaceSection title="Activity" description="Observed development activity from recent GitHub commits.">
      <ProviderNote summary={summary} subject="Activity" />
      {summary.items.length > 0 ? (
        <ActivityRows items={summary.items} compact />
      ) : (
        <WorkspaceEmpty
          title={summary.status === "unavailable" ? "Activity unavailable" : "No recent development activity"}
          message="ProjectDeck does not convert commit volume into progress or intent."
        />
      )}
    </WorkspaceSection>
  );
}

function WorkspaceDocs({ project }) {
  const docs = listDocumentationResources(project.resources);

  return (
    <WorkspaceSection title="Docs" description="Documentation resources linked to this Project.">
      {docs.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {docs.map((resource) => (
            <a className="rounded-xl border border-line bg-surface p-4 hover:border-accent" href={resource.url} key={resource.id} target="_blank" rel="noreferrer">
              <p className="font-semibold">{resource.label}</p>
              <p className="mt-1 font-mono text-[11px] capitalize text-muted">{resource.provider ?? resource.resourceType}</p>
            </a>
          ))}
        </div>
      ) : (
        <WorkspaceEmpty title="No docs linked yet" message="Documentation Resources will appear here when they are linked to this Project." />
      )}
    </WorkspaceSection>
  );
}

function WorkspaceSection({ title, description, children }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-[-0.02em]">{title}</h2>
      {description ? <p className="mt-2 text-sm leading-6 text-subtle">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function WorkspaceEmpty({ title, message }) {
  return (
    <div className="border-t border-line py-7">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-subtle">{message}</p>
    </div>
  );
}

function providerLabel(provider) {
  return {
    railway: "Railway",
    vercel: "Vercel",
    postgresql: "PostgreSQL",
    http: "HTTP",
  }[provider] ?? provider;
}

function HealthEvidence({ project }) {
  const health = project.health;

  return (
    <WorkspaceSection
      title="Health"
      description="Observed operational state. Health is independent from Phase and Next."
    >
      <div className="flex items-center gap-2">
        <span className={`health-dot health-${health.status}`} aria-hidden="true" />
        <p className="text-base font-semibold">{health.label}</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted">{health.reason}</p>
      {health.observations.length > 0 ? (
        <div className="mt-5 border-b border-line">
          {health.observations.map((observation) => (
            <article className="border-t border-line py-4" key={observation.monitor.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {observation.component?.name ? `${observation.component.name} · ` : ""}
                    {observation.monitor.label}
                  </p>
                  <p className="mt-1 flex items-center gap-2 font-mono text-[10.5px] text-muted">
                    <span>{providerLabel(observation.provider)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`health-dot health-${observation.status}`} aria-hidden="true" />
                      {observation.label}
                    </span>
                    {!observation.monitor.affectsProjectHealth ? (
                      <><span aria-hidden="true">·</span><span>Does not affect Project Health</span></>
                    ) : null}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-subtle">{observation.reason}</p>
                  {observation.monitor.legacy ? (
                    <p className="mt-1 font-mono text-[10px] text-muted">
                      {observation.monitor.monitorType === "vercel_deployment"
                        ? "Legacy / deprecated manual Vercel monitor"
                        : "Legacy manual Railway monitor"}
                    </p>
                  ) : null}
                  {observation.observedAt ? (
                    <p className="mt-1 font-mono text-[10px] text-muted">Observed {formatRelativeTime(observation.observedAt)}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={observation.monitor.providerManaged ? updateRailwayAssociationAction : updateHealthMonitorAction}>
                    <input type="hidden" name="slug" value={project.slug} />
                    <input type="hidden" name={observation.monitor.providerManaged ? "associationId" : "monitorId"} value={observation.monitor.id} />
                    <input type="hidden" name="enabled" value={String(!observation.monitor.enabled)} />
                    <input type="hidden" name="affectsProjectHealth" value={String(observation.monitor.affectsProjectHealth)} />
                    <button className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold hover:border-accent" type="submit">
                      {observation.monitor.enabled ? "Disable" : "Enable"}
                    </button>
                  </form>
                  <form action={observation.monitor.providerManaged ? updateRailwayAssociationAction : updateHealthMonitorAction}>
                    <input type="hidden" name="slug" value={project.slug} />
                    <input type="hidden" name={observation.monitor.providerManaged ? "associationId" : "monitorId"} value={observation.monitor.id} />
                    <input type="hidden" name="enabled" value={String(observation.monitor.enabled)} />
                    <input type="hidden" name="affectsProjectHealth" value={String(!observation.monitor.affectsProjectHealth)} />
                    <button className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold hover:border-accent" type="submit">
                      {observation.monitor.affectsProjectHealth ? "Make informational" : "Affect Project Health"}
                    </button>
                  </form>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <WorkspaceEmpty title="No monitors configured" message="Not monitored is a valid operational state, not a provider failure." />
      )}
    </WorkspaceSection>
  );
}

function RailwayMapping({ project, integration }) {
  const connection = integration?.connection;
  const connected = connection?.connectionState === "connected";
  const mapped = (integration?.associations ?? []).filter(
    ({ projectId }) => projectId === project.id,
  );

  return (
    <div className="mt-5 border-t border-line-soft pt-4">
      <p className="text-xs font-semibold text-subtle">Railway</p>
      {!connected ? (
        <p className="mt-2 text-xs leading-5 text-muted">
          Not connected. <Link className="font-semibold text-foreground hover:text-accent" href="/settings#railway">Connect Railway in Settings.</Link>
        </p>
      ) : (
        <>
          {mapped.length > 0 ? (
            <ul className="mt-2 space-y-2 text-xs text-subtle">
              {mapped.map((association) => (
                <li key={association.id}>
                  <span className="font-semibold">{association.displayName}</span>
                  <span className="ml-2 font-mono text-[9px] uppercase tracking-wide text-muted">
                    {association.associationSource === "automatic" ? "Automatically matched" : "Manual mapping"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted">No automatic match</p>
          )}
          {(integration.unmapped ?? []).length > 0 ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-subtle hover:text-foreground">Associate Railway service</summary>
              <form action={associateRailwayResourceAction} className="mt-3 space-y-3">
                <input type="hidden" name="slug" value={project.slug} />
                <label className="block text-xs text-muted">
                  Discovered service
                  <select className="workspace-input" name="externalId" required defaultValue="">
                    <option value="" disabled>Select Project · Environment · Service</option>
                    {integration.unmapped.map((resource) => (
                      <option key={resource.externalId} value={resource.externalId}>{resource.projectName} · {resource.environmentName} · {resource.serviceName}</option>
                    ))}
                  </select>
                </label>
                {project.components.length > 0 ? (
                  <label className="block text-xs text-muted">
                    Component (optional)
                    <select className="workspace-input" name="componentId" defaultValue="">
                      <option value="">Project level</option>
                      {project.components.map((component) => <option key={component.id} value={component.id}>{component.name}</option>)}
                    </select>
                  </label>
                ) : null}
                <label className="block text-xs text-muted">
                  Affects Project Health
                  <select className="workspace-input" name="affectsProjectHealth" defaultValue="true"><option value="true">Yes</option><option value="false">No</option></select>
                </label>
                <button className="workspace-button" type="submit">Associate service</button>
              </form>
            </details>
          ) : null}
          <p className="mt-3 text-xs text-muted">
            <Link className="font-semibold text-subtle hover:text-foreground" href={RAILWAY_MAPPINGS_PATH}>Manage all Railway mappings →</Link>
          </p>
        </>
      )}
    </div>
  );
}

function WorkspaceOverview({ project, card, railwayIntegration }) {
  const quickLinks = buildQuickLinks(project.resources);
  const recentActivity = project.githubSummary.activity;
  const next = buildProjectNextPresentation(card);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,640px)_272px] lg:items-start lg:gap-11">
      <div className="space-y-11">
        <WorkspaceSection title="Phase">
          <div className="flex items-center gap-2 text-sm">
            <span className={`phase-dot phase-${card.phase}`} aria-hidden="true" />
            <span className="font-semibold">{card.phaseLabel}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">
            {card.phaseSource === "override"
              ? "Manual override"
              : `Automatic · ${card.phaseReason}`}
          </p>
        </WorkspaceSection>

        <HealthEvidence project={project} />

        <WorkspaceSection title="Where we are">
          <p className="text-sm leading-6 text-muted">
            No current Project summary has been recorded.
          </p>
        </WorkspaceSection>

        <WorkspaceSection title="Next up">
          <div className="rounded-xl border border-line bg-surface p-5 shadow-[var(--card-shadow)]">
            {next.issueUrl ? (
              <a
                className="text-[16px] font-semibold leading-7 hover:text-accent hover:underline"
                href={next.issueUrl}
                target="_blank"
                rel="noreferrer"
              >
                {next.label}
              </a>
            ) : (
              <p className={`text-[16px] font-semibold leading-7 ${next.isSet ? "" : "text-muted"}`}>
                {next.label}
              </p>
            )}
            <p className="mt-2 font-mono text-[10.5px] leading-5 text-muted">
              {next.source === "manual"
                ? "Manual override"
                : next.source === "inferred"
                  ? `Automatic · ${next.metaLabel}`
                  : `Automatic · ${next.reason}`}
            </p>
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Needs attention">
          {card.needsAttention ? (
            <div className="rounded-xl border border-line bg-surface p-5">
              <span className="attention-pill">Needs Attention</span>
              <p className="mt-3 text-sm leading-6 text-subtle">{card.attentionSummary ?? "Attention is marked, but no summary has been recorded."}</p>
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted">No explicit attention condition is set.</p>
          )}
        </WorkspaceSection>

        <WorkspaceSection title="Recent work" description="Observed GitHub commits are repository activity, not inferred progress.">
          <ProviderNote summary={recentActivity} subject="Activity" />
          {recentActivity.items.length > 0 ? <ActivityRows items={recentActivity.items.slice(0, 6)} compact /> : <WorkspaceEmpty title={recentActivity.status === "unavailable" ? "Activity unavailable" : "No recent development activity"} message="No verified recent commits are available for connected repositories." />}
        </WorkspaceSection>
      </div>

      <div className="space-y-7 lg:sticky lg:top-24">
        <aside className="workspace-rail-section">
          <h3 className="workspace-rail-title">Components</h3>
          {project.components.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {project.components.map((component) => <li key={component.id}>{component.name}{component.currentVersion ? <span className="ml-2 font-mono text-[11px] text-muted">{component.currentVersion}</span> : null}</li>)}
            </ul>
          ) : <p className="text-xs text-muted">No Components</p>}
        </aside>

        <aside className="workspace-rail-section">
          <h3 className="workspace-rail-title">Latest release</h3>
          {project.githubSummary.releases.compactLabel ? <p className="font-mono text-sm font-semibold">{project.githubSummary.releases.compactLabel}</p> : <p className="text-xs leading-5 text-muted">No single safe Project-level Release label</p>}
        </aside>

        <aside className="workspace-rail-section">
          <h3 className="workspace-rail-title">Issues</h3>
          <p className="text-sm font-semibold">{project.githubSummary.issues.label ?? "No GitHub repositories"}</p>
        </aside>

        <aside className="workspace-rail-section">
          <h3 className="workspace-rail-title">Monitoring</h3>
          <p className="text-xs leading-5 text-muted">
            {project.health.monitorCount === 0
              ? "No enabled resource monitors"
              : `${project.health.monitorCount} enabled ${project.health.monitorCount === 1 ? "monitor" : "monitors"}`}
          </p>
          <HealthMonitorForm
            slug={project.slug}
            components={project.components}
          />
          <RailwayMapping project={project} integration={railwayIntegration} />
        </aside>

        <aside className="workspace-rail-section">
          <h3 className="workspace-rail-title">Quick links</h3>
          {quickLinks.length > 0 ? (
            <ul className="space-y-2.5">
              {quickLinks.map((link) => <li key={link.id}><a className="block text-xs font-semibold hover:text-accent" href={link.url} target="_blank" rel="noreferrer">{link.label} ↗</a><span className="font-mono text-[10px] capitalize text-muted">{link.context}</span></li>)}
            </ul>
          ) : <p className="text-xs text-muted">No Resources linked</p>}
        </aside>
      </div>
    </div>
  );
}

export function ProjectWorkspace({
  project,
  card,
  activeTab,
  projectUpdated = false,
  railwayIntegration = null,
}) {
  const content = {
    overview: <WorkspaceOverview project={project} card={card} railwayIntegration={railwayIntegration} />,
    issues: <WorkspaceIssues project={project} />,
    releases: <WorkspaceReleases project={project} />,
    activity: <WorkspaceActivity project={project} />,
    docs: <WorkspaceDocs project={project} />,
  }[activeTab];

  return (
    <section className="workspace-root mx-auto max-w-[1060px] px-5 py-9 sm:px-8 sm:py-11" style={{ "--project-hue": card.accentHue }}>
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <ProjectMark card={card} size="continue" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-[-0.025em]">{card.name}</h1>
              <span className="flex items-center gap-1.5 text-xs text-subtle" title={card.phaseSource === "override" ? "Manual override" : card.phaseReason}><span className={`phase-dot phase-${card.phase}`} aria-hidden="true" />{card.phaseLabel}{card.phaseSource === "override" ? <span className="font-mono text-[9px] uppercase tracking-wide text-muted">Manual</span> : null}</span>
              {card.needsAttention ? <span className="attention-pill">Needs Attention</span> : null}
            </div>
            {card.tagline ? <p className="mt-1.5 text-sm text-subtle">{card.tagline}</p> : null}
          </div>
        </div>
        <Link
          className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold hover:border-[var(--project-color)]"
          href={`/projects/${card.slug}/edit`}
        >
          Edit Project
        </Link>
      </div>

      {projectUpdated ? (
        <p
          className="mt-6 rounded-lg border border-line bg-surface px-4 py-3 text-sm font-medium text-ready"
          role="status"
        >
          Project details updated.
        </p>
      ) : null}

      <nav className="mt-8 border-b border-line" aria-label={`${card.name} workspace`}>
        <ul className="flex gap-1 overflow-x-auto">
          {WORKSPACE_TABS.map((tab) => (
            <li key={tab.id}>
              <Link className={`workspace-tab ${activeTab === tab.id ? "workspace-tab-active" : ""}`} href={tab.id === "overview" ? `/projects/${card.slug}` : `/projects/${card.slug}?tab=${tab.id}`} aria-current={activeTab === tab.id ? "page" : undefined}>{tab.label}</Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-9">{content}</div>
    </section>
  );
}
