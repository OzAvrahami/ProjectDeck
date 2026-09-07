# Issue #16 validation

Validated on September 7, 2026 against the local production build and the configured authenticated ProjectDeck database/GitHub data. No database or provider evidence was modified for validation.

## Pre-flight and audit

- Repository: `D:\code\ProjectDeck`, origin `https://github.com/OzAvrahami/ProjectDeck.git`, branch `main`, initially clean.
- Local HEAD, `origin/main`, and remote main: `1852390e9bb402ea8b674119c493af0c982631a4`.
- #14 and #15: Closed / Completed / Done. #6: Closed / Completed / Done.
- #16 began Open / Ready / P1 — High, with exactly one ProjectDeck Development item. Moved only its Status to In Progress and re-read it. Priority, labels, body, and open state were preserved.
- Read #16, #6, Product, architecture and UX docs; inspected the requested card, Workspace, global view, routes, summary/model, observation selection, and Release adapter files.

The external review exposed a real discoverability gap:

| Surface | Before | Result |
| --- | --- | --- |
| Portfolio | `Release` with a metadata-styled value; value opened Workspace Releases, with hover-only styling and no direct GitHub Release link. Empty values used the same link treatment. | Persistently underlined `Releases →` opens Workspace. Exact single-repository `version ↗` is separately underlined and opens the authoritative GitHub Release. Empty/uncertain values are plain text. |
| Workspace Overview | Releases available through tabs, but the latest-release rail was plain text with no route. | Releases tab remains in the same hierarchy; the rail also has `View Releases →`. |
| Workspace Releases | Repository-first list; tag happened to open GitHub, with hover-only styling. No explicit latest hierarchy or history destination. | `Latest Release`, prominent exact tag, meaningful name, pre-release marker, published date, explicit `Open on GitHub ↗`, and per-repository `Release history on GitHub ↗`. |
| Global Releases | Project/repository scope already present, but unstyled version was the external link and the timestamp lacked a Published label. | Project name links to internal Releases; each row has scope, exact tag, Published date, and `Open Release on GitHub ↗`. |

The data model still contains only the latest published Release per repository. History opens GitHub; no Release body, extra provider query, synthesized Product version, or Release-management UI was introduced.

## Live and deterministic evidence

- **Finance Tracker:** real published `v1.1.1`, published September 7, 2026, non-draft and non-prerelease. Card and Workspace/global actions retain exactly `https://github.com/OzAvrahami/finance-tracker/releases/tag/v1.1.1`, independently verified against GitHub's Release response. Workspace retains its meaningful name, publication date and repository identity. Overview's explicit route is `/projects/finance-tracker?tab=releases`.
- **LimitPact:** real saved multi-repository Product with Desktop (`OzAvrahami/limitpact-desktop`) and Website (`OzAvrahami/limitpact-website`). Both currently have no published Release. Workspace retains both named rows and separate repository history destinations. The card has no external version action. Deterministic component tests cover independent `v1.1.0` / `v2.0.0`, one released plus one empty repository, and one released plus one unavailable repository.
- **Celi Trip:** real successful empty Release observation renders `No published Release`, with no fake Release-object action.
- **Tag-only regression:** `OzAvrahami/ProjectDeck` has Git tag `v0.1.0` and an empty GitHub Releases response. Its card and `/projects/project-deck?tab=releases` show `No published Release`; the tag is not promoted into a version or Release-object link. Repository history remains a clearly labeled navigation destination.
- **Partial/unavailable:** deterministic transport test returns a published Release for Desktop and HTTP 503 for Website. Only the two Release endpoints are requested. Workspace shows `Release information incomplete`, the independently actionable verified Desktop Release, and Website's `Release unavailable`. The card never makes that partial result an authoritative external headline. Separate tests cover complete unavailability, successful absence and not connected, including the global empty states.
- **Global `/releases`:** authenticated HTTP 200 with Finance Tracker, Google Drive Pdf Sync and Life OS Releases, their Project/repository identities, publication dates, explicit external actions, and internal Workspace Releases routes.

Authenticated production rendering returned HTTP 200 for Portfolio, Workspace Overview, single-repository Releases, multi-repository Releases, empty/tag-only Releases, and global Releases. Initial measured Release Workspace shell delivery was 94–111 ms, preceding completed Release content at 389–452 ms. Global Releases shell arrived in 19 ms and content completed in 1,299 ms. One Overview measurement was 282 ms for its shell and 1,766 ms complete; these are local samples, not a timing guarantee.

## Accessibility, responsiveness and navigation

- Native anchors provide keyboard access; external Release/history actions announce GitHub, exact object/repository identity and new-tab behavior. Icons are decorative to assistive technology.
- Persistent underlines and arrows establish affordance without relying only on color. Existing global focus outlines and card secondary-link stacking remain intact. Empty/uncertain metadata no longer receives link hover styling.
- Card overlay and Release links are sibling anchors, verified in semantic rendering and existing overlay checks. No nested anchors or click interception was added.
- Internal links use the Project's encoded slug and normal Next navigation; no `replace`, custom history manipulation or new client state was added. External links open a new tab, retaining ProjectDeck context.
- Desktop/mobile source inspection confirms bounded card metadata, retained two-line clamping, a separate nonshrinking external arrow, wrapping long tags/names/scopes, wrapping prerelease labels, and stacked global rows below the `sm` breakpoint. Long names and prereleases are included in semantic component coverage.
- **Limitation:** browser discovery returned no connected browsers. The user-authorized fallback of authenticated production rendering plus HTML/CSS inspection was used. Actual mouse/keyboard interactions, browser Back, visual focus appearance, desktop/mobile screenshots and pixel overflow were not browser-verified.

## Architecture and provider scope

The #14 shell/Suspense boundary, exact-slug lookup, shared observation promise and secondary Overview audit remain unchanged. Releases still requests only `features: ["releases"]`; Issues, Activity, implementation, Health, Railway/Vercel and GitHub Standard are not added to that path. The #15 Issue pagination/filters/count and partial semantics remain unchanged. Existing architecture regressions and the new Release-only transport test pass.

The existing `fetchLatestPublishedGitHubRelease()` drains all REST Release pages at 100 records/page before sorting by publication date. No provider selection/pagination behavior was changed here. Follow-up [#28](https://github.com/OzAvrahami/ProjectDeck/issues/28) tracks a bounded lookup that must preserve publication-date ordering, drafts, prereleases, and uncertain evidence.

## Checks and acceptance

- `npm test`: 387 tests passed across 36 files, including semantic Release component coverage and existing #14/#15 regressions.
- `npm run lint`: passed.
- `npm run build`: passed with the configured production environment.
- `git diff --check`: passed.
- Windows commands used `npm.cmd` because this shell blocks the `npm.ps1` shim. The already-installed esbuild version is now an explicit dev dependency for semantic JSX component testing; no runtime dependency was added.

Acceptance question: the implementation now visibly identifies Release context, exposes an underlined version with an external arrow, names GitHub explicitly in detail views, and keeps an underlined internal Releases route. It no longer requires discovering a hover-only version link. This passes the implementation/DOM acceptance review; hands-on first-time-user and visual browser verification remain subject to the limitation above.

After the final checks, #16 moved In Progress → Verify and was re-read as Open / Verify / P1 — High. Its unique Project item, labels and body remained unchanged. #14 and #15 were re-read as Closed / Completed / Done.

No `git add`, `git commit`, or `git push` was run. Changes are ready for manual review and commit, with the browser-validation limitation recorded above.

## Files changed

- UI: `app/globals.css`, `components/portfolio/project-card.js`, `components/workspace/project-workspace.js`, new `components/workspace/workspace-releases.js`, `components/github/github-observation-views.js`, new `components/github/release-link.js`.
- Presentation model: `lib/projects/portfolio.js`, `lib/projects/github-summary.js`.
- Documentation: `docs/ux.md`, `docs/architecture.md`, new `docs/issue-16-validation.md`. Product authority rules in `docs/product.md` required no change.
- Tests: new `tests/unit/release-discoverability.test.js`, `tests/unit/github-summary.test.js`, `tests/unit/portfolio.test.js`, `tests/unit/project-card.test.js`.
- Test tooling: `vitest.config.js`, `package.json`, `package-lock.json`.

Local validation scripts and authenticated HTML are in ignored `.cache/` files and are not part of the commit changes.
