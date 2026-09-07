import Link from "next/link";

export function IssuePagination({ pagination, hrefFor }) {
  if (!pagination) return null;
  if (
    ["unavailable", "not_connected"].includes(pagination.status) &&
    !pagination.invalidCursor
  ) {
    return null;
  }

  const count = `${pagination.filteredTotalCount}${pagination.status === "partial" ? "+" : ""}`;
  const subject = pagination.type === "bug" ? "bugs" : "open Issues";

  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-mono text-[11px] text-muted">
          {pagination.items?.length === 0 || pagination.visibleStart === 0
            ? `0 of ${count} ${subject}`
            : `Showing ${pagination.visibleStart}–${pagination.visibleEnd} of ${count} ${subject}`}
        </p>
        {pagination.invalidCursor ? (
          <p className="mt-1 text-xs text-subtle">
            That page link was invalid, so the first page is shown.
          </p>
        ) : null}
        {pagination.status === "partial" ? (
          <p className="mt-1 text-xs text-subtle">
            Pagination is paused while repository evidence is incomplete.
          </p>
        ) : null}
      </div>
      {(pagination.hasPreviousPage || pagination.hasNextPage) ? (
        <nav className="flex gap-2" aria-label="Issue pages">
          {pagination.hasPreviousPage ? (
            <Link
              className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-subtle hover:border-accent hover:text-foreground"
              href={hrefFor(pagination.previousCursor)}
              rel="prev"
            >
              Previous
            </Link>
          ) : (
            <span className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-muted/50" aria-disabled="true">
              Previous
            </span>
          )}
          {pagination.hasNextPage ? (
            <Link
              className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-subtle hover:border-accent hover:text-foreground"
              href={hrefFor(pagination.nextCursor)}
              rel="next"
            >
              Next
            </Link>
          ) : (
            <span className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-muted/50" aria-disabled="true">
              Next
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
