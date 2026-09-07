import { ReleaseLink, ReleasePublishedTime } from "../github/release-link.js";

export function WorkspaceReleases({ project }) {
  const summary = project.githubSummary.releases;
  const multiple = summary.repositories.length > 1;

  return (
    <section>
      <h2 className="text-lg font-semibold">Releases</h2>
      <p className="mt-2 mb-6 text-sm leading-6 text-subtle">
        {multiple
          ? "Latest published GitHub Release per repository. Components release independently."
          : "Latest published GitHub Release. Open GitHub for Release details and history."}
      </p>
      <p className="mb-6 text-xs leading-5 text-muted">
        A published version does not confirm a production deployment or runtime Health.
      </p>
      {summary.status === "partial" || summary.status === "unavailable" ? (
        <aside className="mb-4 rounded-lg border border-line bg-background px-3 py-2 text-sm text-subtle">
          <p className="font-semibold">
            {summary.status === "partial" ? "Release information incomplete" : "Release unavailable"}
          </p>
          <p className="mt-1 text-xs leading-5">
            GitHub Release evidence could not be verified for {summary.failedRepositoryCount}{" "}
            {summary.failedRepositoryCount === 1 ? "repository" : "repositories"}.
            {summary.status === "partial" ? " Verified results are shown below." : " Try again shortly."}
          </p>
        </aside>
      ) : null}
      {summary.repositories.length ? (
        <div className="border-b border-line">
          {summary.repositories.map((repository) => {
            const release = repository.latestRelease;
            const identity = repository.repository;
            const historyUrl = identity?.owner && identity?.name
              ? `https://github.com/${encodeURIComponent(identity.owner)}/${encodeURIComponent(identity.name)}/releases`
              : null;
            return (
              <article
                className="min-w-0 border-t border-line py-5 [overflow-wrap:anywhere]"
                key={repository.resourceId}
              >
                {multiple ? (
                  <h3 className="font-semibold">
                    {repository.component?.name ?? identity?.fullName ?? "Repository"}
                  </h3>
                ) : null}
                <p className="mt-1 font-mono text-[11px] text-muted">
                  {identity?.fullName ?? repository.scopeLabel}
                </p>
                {repository.providerStatus === "unavailable" ? (
                  <p className="mt-3 text-sm font-semibold text-subtle">Release unavailable</p>
                ) : release ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-subtle">Latest Release</p>
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="font-mono text-xl font-semibold">{release.tagName}</p>
                      {release.prerelease ? (
                        <span className="rounded border border-line px-2 py-0.5 text-[11px] font-semibold text-subtle">
                          Pre-release
                        </span>
                      ) : null}
                    </div>
                    {release.name && release.name !== release.tagName ? (
                      <p className="mt-2 text-sm text-subtle">{release.name}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted">
                      <ReleasePublishedTime value={release.publishedAt} />
                    </p>
                    <div className="mt-3"><ReleaseLink release={release} /></div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-subtle">
                    <p>No published Release</p>
                    <p className="mt-1 text-xs text-muted">
                      GitHub checked successfully. Tags alone are not published Releases.
                    </p>
                  </div>
                )}
                {historyUrl ? (
                  <a
                    className="release-navigation mt-2 inline-block py-1 text-xs text-subtle"
                    href={historyUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`View Release history for ${identity.fullName} on GitHub (opens in a new tab)`}
                  >
                    Release history on GitHub <span aria-hidden="true">↗</span>
                  </a>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="border-t border-line py-6 text-sm text-subtle">No connected GitHub repositories</p>
      )}
    </section>
  );
}
