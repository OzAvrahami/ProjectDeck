import { formatRelativeTime, normalizeProjectAccent } from "../../lib/projects/portfolio.js";

const FAILURE_REASON_LABELS = {
  missing_token: "GitHub is not configured",
  authentication: "GitHub authentication failed",
  permission: "GitHub permission is missing",
  rate_limit: "GitHub rate limit reached",
  repository_unavailable: "Repository unavailable",
  invalid_identity: "Repository identity could not be verified",
  provider: "GitHub temporarily unavailable",
};

function ProjectScope({ item }) {
  const accentHue = normalizeProjectAccent(
    item.project.accent,
    item.project.name,
  );

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{
          background: `oklch(var(--project-lightness) var(--project-chroma) ${accentHue})`,
        }}
        aria-hidden="true"
      />
      <span className="font-mono text-[11.5px] text-muted">
        {item.project.name}
      </span>
      <span className="text-muted/45" aria-hidden="true">
        /
      </span>
      <span className="font-mono text-[11.5px] text-muted">
        {item.component?.name
          ? `${item.component.name} · ${item.repository.fullName}`
          : item.repository.fullName}
      </span>
    </div>
  );
}

function ProviderNotice({ check, subject }) {
  if (check.failedRepositoryCount === 0) {
    return null;
  }

  const reasons = [
    ...new Set(
      check.failures.map(
        (failure) => FAILURE_REASON_LABELS[failure.code] ?? "Provider failure",
      ),
    ),
  ];

  return (
    <aside className="mb-6 rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-6 text-subtle">
      <p className="font-semibold text-foreground">
        {subject} could not be checked for {check.failedRepositoryCount}{" "}
        {check.failedRepositoryCount === 1 ? "repository" : "repositories"}.
      </p>
      <p className="mt-1">
        {check.checkedRepositoryCount > 0
          ? "Available results are shown; totals may be incomplete. "
          : "No connected repository could be checked. "}
        {reasons.join(" · ")}
      </p>
    </aside>
  );
}

function ObservationHeader({ title, description, check }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold tracking-[-0.025em]">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-subtle">{description}</p>
      {check.checkedRepositoryCount > 0 ? (
        <p className="mt-3 font-mono text-[11px] text-muted">
          GitHub checked on this page load · {check.checkedRepositoryCount}{" "}
          {check.checkedRepositoryCount === 1 ? "repository" : "repositories"}
        </p>
      ) : null}
    </div>
  );
}

function EmptyObservationState({ title, message }) {
  return (
    <div className="border-t border-line py-8">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-subtle">{message}</p>
    </div>
  );
}

export function IssuesView({ issues, check }) {
  let emptyState = null;

  if (issues.length === 0) {
    if (check.repositoryCount === 0) {
      emptyState = {
        title: "No connected GitHub repositories",
        message: "Import a GitHub repository before checking portfolio Issues.",
      };
    } else if (check.checkedRepositoryCount === 0) {
      emptyState = {
        title: "Issues unavailable",
        message: "ProjectDeck could not verify open Issues for the connected repositories.",
      };
    } else if (check.failedRepositoryCount > 0) {
      emptyState = {
        title: "No Issues found in checked repositories",
        message: "Some repositories remain unavailable, so this is not a complete zero count.",
      };
    } else {
      emptyState = {
        title: "No open Issues",
        message: "Every connected repository was checked successfully.",
      };
    }
  }

  return (
    <section className="mx-auto max-w-[760px] px-5 py-10 sm:px-8 sm:py-12 lg:pb-24">
      <ObservationHeader
        title="Issues"
        description="Open Issues worth knowing about across Projects, most recently updated first."
        check={check}
      />
      <ProviderNotice check={check} subject="Issues" />

      {issues.length > 0 ? (
        <div className="border-b border-line">
          {issues.map((issue) => (
            <article className="border-t border-line py-4" key={issue.id}>
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <ProjectScope item={issue} />
                  <a
                    className="mt-2 block text-[15px] font-medium leading-6 hover:text-accent hover:underline"
                    href={issue.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {issue.title}
                  </a>
                  <p className="mt-1.5 font-mono text-[11.5px] text-muted">
                    #{issue.number}
                  </p>
                </div>
                <span className="shrink-0 pt-0.5 font-mono text-[11.5px] text-muted">
                  Updated {formatRelativeTime(issue.updatedAt) ?? "time unknown"}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyObservationState {...emptyState} />
      )}
    </section>
  );
}

export function ReleasesView({ releases, check }) {
  let emptyState = null;

  if (releases.length === 0) {
    if (check.repositoryCount === 0) {
      emptyState = {
        title: "No connected GitHub repositories",
        message: "Import a GitHub repository before checking portfolio Releases.",
      };
    } else if (check.checkedRepositoryCount === 0) {
      emptyState = {
        title: "Releases unavailable",
        message: "ProjectDeck could not verify Releases for the connected repositories.",
      };
    } else if (check.failedRepositoryCount > 0) {
      emptyState = {
        title: "No Releases found in checked repositories",
        message: "Some repositories remain unavailable, so other Releases may be unknown.",
      };
    } else {
      emptyState = {
        title: "No published Releases",
        message: "Every connected repository was checked successfully; ordinary Git tags are not included.",
      };
    }
  }

  return (
    <section className="mx-auto max-w-[760px] px-5 py-10 sm:px-8 sm:py-12 lg:pb-24">
      <ObservationHeader
        title="Releases"
        description="Latest published GitHub Releases across Projects, with repository scope preserved."
        check={check}
      />
      <ProviderNotice check={check} subject="Releases" />

      {releases.length > 0 ? (
        <div className="border-b border-line">
          {releases.map((release) => (
            <article className="border-t border-line py-4" key={release.id}>
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <ProjectScope item={release} />
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <a
                      className="font-mono text-[14px] font-semibold hover:text-accent hover:underline"
                      href={release.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {release.tagName}
                    </a>
                    {release.name && release.name !== release.tagName ? (
                      <span className="text-sm text-subtle">{release.name}</span>
                    ) : null}
                    {release.prerelease ? (
                      <span className="font-mono text-[11px] text-muted">
                        Prerelease
                      </span>
                    ) : null}
                  </div>
                </div>
                <span className="shrink-0 pt-0.5 font-mono text-[11.5px] text-muted">
                  {formatRelativeTime(release.publishedAt) ?? "Date unknown"}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyObservationState {...emptyState} />
      )}
    </section>
  );
}

export function ObservationDatabaseError({ subject }) {
  return (
    <section className="mx-auto max-w-[760px] px-5 py-10 sm:px-8 sm:py-12">
      <h1 className="text-2xl font-semibold">{subject}</h1>
      <div className="mt-8 rounded-xl border border-line bg-surface p-5">
        <p className="font-semibold">Project data unavailable</p>
        <p className="mt-2 text-sm leading-6 text-subtle">
          ProjectDeck could not reach its database. GitHub was not queried
          without the connected Project and repository context.
        </p>
      </div>
    </section>
  );
}
