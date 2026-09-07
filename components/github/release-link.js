export function ReleaseLink({ release, children = "Open on GitHub" }) {
  return (
    <a
      className="release-navigation inline-flex max-w-full items-baseline gap-1 py-1 text-xs font-semibold"
      href={release.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open published GitHub Release ${release.tagName} for ${release.repository.fullName} (opens in a new tab)`}
    >
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}

export function ReleasePublishedTime({ value }) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Published date unavailable";

  return (
    <span>
      Published <time dateTime={value}>
        {new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        }).format(date)}
      </time>
    </span>
  );
}
