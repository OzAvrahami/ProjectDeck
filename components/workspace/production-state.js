import Link from "next/link";

import { buildProductionState } from "../../lib/projects/production-state.js";
import { projectReleasesHref } from "../../lib/projects/navigation.js";
import { ReleaseLink } from "../github/release-link.js";

function DeploymentEvidence({ deployment }) {
  return (
    <div className="space-y-2 border-t border-line-soft pt-3 first:border-0 first:pt-0">
      <p className="text-xs font-semibold">{deployment.service}</p>
      <p className="text-xs text-muted">{deployment.provider} · {deployment.environment}</p>
      {deployment.state === "unavailable" ? (
        <p className="text-sm font-semibold">Deployment unavailable</p>
      ) : deployment.state === "partial" ? (
        <p className="text-sm font-semibold">Deployment information incomplete</p>
      ) : null}
      <dl className="space-y-2 text-xs">
        <div>
          <dt className="text-muted">{deployment.servingLabel}</dt>
          <dd className="mt-0.5 font-semibold">
            {deployment.serving}
            {deployment.servingId ? <code className="ml-2 font-normal" title={deployment.servingId}>{deployment.servingId.slice(0, 8)}</code> : null}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Latest deployment attempt</dt>
          <dd className="mt-0.5 font-semibold">
            {deployment.latest}
            {deployment.latestId ? <code className="ml-2 font-normal" title={deployment.latestId}>{deployment.latestId.slice(0, 8)}</code> : null}
          </dd>
        </div>
      </dl>
      {deployment.note ? <p className="text-xs leading-5 text-muted">{deployment.note}</p> : null}
      {deployment.observedAt ? (
        <p className="text-[11px] text-muted">Provider state at <time dateTime={deployment.observedAt}>{deployment.observedAt.replace("T", " ").replace(/\.\d+Z$|Z$/, " UTC")}</time></p>
      ) : null}
    </div>
  );
}

export function ProductionState({ project }) {
  const state = buildProductionState(project);
  return (
    <section aria-labelledby="production-state-title" className="project-production-state">
      <h2 id="production-state-title" className="text-lg font-semibold">Project state</h2>
      <p className="mt-2 max-w-3xl text-xs leading-5 text-muted">
        A published version does not prove it is deployed. Deployment success is not a runtime check. Health does not identify the deployed version.
      </p>
      {project.githubSummary?.releases?.status === "partial" ? (
        <p className="mt-2 text-xs font-semibold text-subtle">Release information incomplete. Some repositories could not be checked.</p>
      ) : null}
      {state.scoped ? (
        <p className="mt-3 text-sm">
          <span className="font-semibold">Project Health: {state.health.label}</span>
          <span className="ml-2 text-xs text-muted">Combined health-affecting monitors across Components and Project-level resources</span>
        </p>
      ) : null}
      <div className="mt-5 space-y-5">
        {state.scopes.map((scope) => (
          <div key={scope.id} role="group" aria-label={scope.name ?? project.name}>
            {scope.name ? <h3 className="mb-3 font-semibold [overflow-wrap:anywhere]">{scope.name}</h3> : null}
            <dl className="production-state-grid">
              <div className="production-state-signal">
                <dt className="font-semibold">Release</dt>
                <dd>
                  <p className="mt-1 text-xs text-muted">Published version from GitHub</p>
                  <div className="mt-4 space-y-3">
                    {scope.releases.length ? scope.releases.map((repository) => (
                      <div key={repository.resourceId}>
                        <p className="text-[11px] text-muted">{repository.repository?.fullName ?? repository.scopeLabel}</p>
                        <p className="mt-1 text-sm font-semibold">
                          {repository.providerStatus === "unavailable" ? "Release unavailable" : repository.latestRelease?.tagName ?? "No published Release"}
                        </p>
                        {repository.latestRelease && repository.providerStatus === "success" ? (
                          <>
                            {repository.latestRelease.prerelease ? <p className="text-xs text-subtle">Pre-release</p> : null}
                            <ReleaseLink release={repository.latestRelease} />
                          </>
                        ) : null}
                      </div>
                    )) : <p className="text-sm font-semibold">Not connected</p>}
                  </div>
                  <Link className="release-navigation mt-3 inline-block py-1 text-xs font-semibold" href={projectReleasesHref(project.slug)} aria-label={`View Releases for ${project.name}${scope.name ? ` — ${scope.name}` : ""}`}>
                    View Releases <span aria-hidden="true">→</span>
                  </Link>
                </dd>
              </div>
              <div className="production-state-signal">
                <dt className="font-semibold">Deployment</dt>
                <dd>
                  <p className="mt-1 text-xs text-muted">Provider deployment evidence</p>
                  <div className="mt-4 space-y-3">
                    {scope.deployments.length ? scope.deployments.map((deployment) => (
                      <DeploymentEvidence key={deployment.id} deployment={deployment} />
                    )) : (
                      <>
                        <p className="text-sm font-semibold">Not connected</p>
                        <p className="text-xs leading-5 text-muted">No deployment service is connected here.</p>
                      </>
                    )}
                  </div>
                </dd>
              </div>
              <div className="production-state-signal">
                <dt className="font-semibold">Health</dt>
                <dd>
                  <p className="mt-1 text-xs text-muted">Runtime status from configured monitors</p>
                  <p className="mt-4 text-sm font-semibold">{scope.health.label}</p>
                  {scope.healthBasis.sources.length ? <p className="mt-2 text-xs leading-5 text-subtle">Based on: {scope.healthBasis.sources.join(" · ")}</p> : null}
                  <p className="mt-2 text-xs leading-5 text-muted">{scope.healthBasis.note}</p>
                  <a className="release-navigation mt-3 inline-block py-1 text-xs font-semibold" href="#health-evidence" aria-label={`View Health evidence${scope.name ? ` for ${scope.name}` : ""}`}>
                    View monitor evidence <span aria-hidden="true">↓</span>
                  </a>
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
