import {
  formatCompactRelativeTime,
  normalizeProjectAccent,
} from "../../lib/projects/portfolio.js";

const FAILURE_LABELS = {
  missing_token: "GitHub is not configured",
  authentication: "GitHub authentication failed",
  permission: "GitHub permission is missing",
  rate_limit: "GitHub rate limit reached",
  repository_unavailable: "Repository unavailable",
  invalid_identity: "Repository identity could not be verified",
  provider: "GitHub temporarily unavailable",
};

export function ActivityRows({ items, compact = false }) {
  return (
    <div className="border-b border-line">
      {items.map((item) => {
        const accentHue = normalizeProjectAccent(
          item.project.accent,
          item.project.name,
        );

        return (
          <article
            className="border-t border-line py-4"
            key={`${item.repository.fullName}:${item.sha}`}
          >
            <div className="flex items-start justify-between gap-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11.5px] text-muted">
                  {!compact ? (
                    <>
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: `oklch(var(--project-lightness) var(--project-chroma) ${accentHue})`,
                        }}
                        aria-hidden="true"
                      />
                      <span>{item.project.name}</span>
                      <span className="opacity-45" aria-hidden="true">/</span>
                    </>
                  ) : null}
                  <span>
                    {item.component?.name
                      ? `${item.component.name} · ${item.repository.fullName}`
                      : item.repository.fullName}
                  </span>
                </div>
                <a
                  className="mt-2 block text-[15px] font-medium leading-6 hover:text-accent hover:underline"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.message}
                </a>
                <p className="mt-1.5 font-mono text-[11px] text-muted">
                  {item.shortSha}{item.author ? ` · ${item.author}` : ""}
                </p>
              </div>
              <span className="shrink-0 pt-0.5 font-mono text-[11px] text-muted">
                {formatCompactRelativeTime(item.committedAt) ?? "Time unknown"}
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function ActivityView({ activity, check }) {
  const reasons = [
    ...new Set(
      check.failures.map(
        (failure) => FAILURE_LABELS[failure.code] ?? "Provider failure",
      ),
    ),
  ];

  return (
    <section className="mx-auto max-w-[760px] px-5 py-10 sm:px-8 sm:py-12 lg:pb-24">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Activity</h1>
        <p className="mt-2 text-sm leading-6 text-subtle">
          Recent commits observed on connected GitHub repositories.
        </p>
        {check.checkedRepositoryCount > 0 ? (
          <p className="mt-3 font-mono text-[11px] text-muted">
            GitHub checked on this page load · {check.checkedRepositoryCount} {check.checkedRepositoryCount === 1 ? "repository" : "repositories"}
          </p>
        ) : null}
      </div>

      {check.failedRepositoryCount > 0 ? (
        <aside className="mb-6 rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-6 text-subtle">
          <p className="font-semibold text-foreground">
            Activity could not be checked for {check.failedRepositoryCount} {check.failedRepositoryCount === 1 ? "repository" : "repositories"}.
          </p>
          <p className="mt-1">
            {check.checkedRepositoryCount > 0 ? "Available activity is shown. " : "No connected repository could be checked. "}
            {reasons.join(" · ")}
          </p>
        </aside>
      ) : null}

      {activity.length > 0 ? (
        <ActivityRows items={activity} />
      ) : (
        <div className="border-t border-line py-8">
          <p className="font-semibold">
            {check.repositoryCount === 0
              ? "No connected GitHub repositories"
              : check.checkedRepositoryCount === 0
                ? "Activity unavailable"
              : "No commit activity"}
          </p>
          <p className="mt-2 text-sm leading-6 text-subtle">
            {check.repositoryCount === 0
              ? "Import a GitHub repository before checking Activity."
              : check.checkedRepositoryCount === 0
                ? "ProjectDeck could not verify recent commits for the connected repositories."
                : "The connected repositories were checked successfully."}
          </p>
        </div>
      )}
    </section>
  );
}
