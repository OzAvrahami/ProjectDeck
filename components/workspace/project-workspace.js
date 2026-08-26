import Link from "next/link";

import { ActivityRows } from "../github/activity-view.js";
import { ProjectMark } from "../portfolio/project-card.js";
import { WORKSPACE_TABS } from "../../lib/projects/navigation.js";
import { formatRelativeTime } from "../../lib/projects/portfolio.js";
import {
  buildQuickLinks,
  listDocumentationResources,
} from "../../lib/projects/workspace.js";
import { RailwayConnectForm } from "./railway-connect-form.js";

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

function RuntimePanel({ project, railwaySummary }) {
  return (
    <aside className="workspace-rail-section">
      <h3 className="workspace-rail-title">Runtime</h3>
      {railwaySummary.status === "not_connected" ? (
        <p className="text-xs leading-5 text-muted">No Railway service connected</p>
      ) : (
        <div className="space-y-3">
          {railwaySummary.items.map((item) => (
            <div key={item.resource.id}>
              <a className="text-xs font-semibold hover:text-accent" href={item.resource.url} target="_blank" rel="noreferrer">{item.resource.label}</a>
              <p className="mt-1 text-xs leading-5 text-muted">
                {item.status === "success" ? item.label : "Runtime unavailable"}
              </p>
              {item.status === "success" && item.deployment?.observedStateAt ? (
                <p className="font-mono text-[10px] text-muted">Observed {formatRelativeTime(item.deployment.observedStateAt)}</p>
              ) : null}
              {item.status === "unavailable" ? (
                <p className="font-mono text-[10px] text-muted">{item.error.message}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <RailwayConnectForm slug={project.slug} components={project.components} />
    </aside>
  );
}

function WorkspaceOverview({ project, card, railwaySummary }) {
  const quickLinks = buildQuickLinks(project.resources);
  const recentActivity = project.githubSummary.activity;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,640px)_272px] lg:items-start lg:gap-11">
      <div className="space-y-11">
        <WorkspaceSection title="Where we are">
          <p className="text-sm leading-6 text-muted">
            No current Project summary has been recorded.
          </p>
        </WorkspaceSection>

        <WorkspaceSection title="Next up">
          <div className="rounded-xl border border-line bg-surface p-5 shadow-[var(--card-shadow)]">
            <p className={`text-[16px] font-semibold leading-7 ${card.nextAction ? "" : "text-muted"}`}>{card.nextAction ?? "No next action set"}</p>
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

        <RuntimePanel project={project} railwaySummary={railwaySummary} />

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

export function ProjectWorkspace({ project, card, railwaySummary, activeTab }) {
  const content = {
    overview: <WorkspaceOverview project={project} card={card} railwaySummary={railwaySummary} />,
    issues: <WorkspaceIssues project={project} />,
    releases: <WorkspaceReleases project={project} />,
    activity: <WorkspaceActivity project={project} />,
    docs: <WorkspaceDocs project={project} />,
  }[activeTab];

  return (
    <section className="workspace-root mx-auto max-w-[1060px] px-5 py-9 sm:px-8 sm:py-11" style={{ "--project-hue": card.accentHue }}>
      <div className="flex items-center gap-4">
        <ProjectMark card={card} size="continue" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-[-0.025em]">{card.name}</h1>
            <span className="flex items-center gap-1.5 text-xs text-subtle"><span className={`lifecycle-dot lifecycle-${card.lifecycleState}`} aria-hidden="true" />{card.lifecycleLabel}</span>
            {card.needsAttention ? <span className="attention-pill">Needs Attention</span> : null}
          </div>
          {card.tagline ? <p className="mt-1.5 text-sm text-subtle">{card.tagline}</p> : null}
        </div>
      </div>

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
