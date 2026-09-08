# Issue #30 validation

Validated on 2026-09-08 in `/Users/ozavrahami/code/ProjectDeck` (the available macOS checkout of `OzAvrahami/ProjectDeck`; the requested Windows path is not present here).

## Pre-flight

- Branch `main`, initially clean.
- Local HEAD, `origin/main`, and remote `main`: `433639d25e26f6dc18129d1cfdb4d8f56b35ecf4`.
- Latest published GitHub Release: `v0.2.0`, published 2026-09-07T19:38:19Z; not a draft/prerelease.
- Package and lockfile versions: 0.2.0. Unreleased was empty before this work.
- #14–#17 and #29: Closed / Done.
- All 29 existing Issues searched. No equivalent Health alerting Issue existed; #30 was created as feature / backend / frontend / database, P1 — High, In Progress in ProjectDeck Development.

## Checks performed

| Check | Result |
| --- | --- |
| `npm test`, with isolated `TEST_ALERT_DATABASE_URL` | **450 passed**, 40 files; includes 17 PostgreSQL integration cases. |
| `npm run lint` | Passed. |
| `npm run build` | Passed, including a production build with fake access/notification configuration canaries. |
| `git diff --check` | Passed. |
| `npm run db:generate` after generated migration | No remaining schema changes. |
| Migration chain | Applied only to an isolated localhost PostgreSQL test database. Never applied to production. |
| Client bundles | No fake provider-secret, sender or session-secret canary values found under `.next/static`. |
| Authenticated production UI | Passed: unauthenticated Notifications redirects to login; authenticated recipient save/E.164 normalization, per-Project opt-out and opt-in, Settings navigation, disabled unconfigured test buttons, desktop/mobile rendering, no page overflow, no browser exceptions. |
| CLI | Normal, `--no-delivery` and `--dry-run` invocations exited 0 on local Healthy / Degraded / Not monitored HTTP fixtures. Each counted one of each state; alerting disabled, zero incidents/deliveries created and zero message attempts. |
| Real Email / SMS | **None**. Providers mocked in tests; credentials absent for browser/CLI validation. |

The PostgreSQL suite uses real SQL transactions, parallel clients, migrations and uniqueness constraints. It covers simultaneous incident creation and delivery claiming, Degraded confirmation, one escalation/recovery, independent retries, an Email backlog that cannot starve SMS, ambiguous/crashed delivery handling, immutable Email requests, expiry, superseded messages, opt-out, Unknown, separate Email/SMS test records, test replay/cooldown, and Health-only network loading.

The browser used the actual production Next.js build and local PostgreSQL fixture data. Existing Neon HTTP UI queries were routed through a temporary local-only test transport that executed the actual SQL; notification transactions used the PostgreSQL connection directly. This validates authenticated application behavior, not connectivity to Neon production. No test transport or browser tooling is shipped in application code.

## Limits and owner verification

This checkout contains no `.env.local`, database or provider environment. Live production-data checks could not be performed. No real Project was taken down. No production recipients/settings were read or changed. No Railway service, schedule, infrastructure, deployment or production migration was changed. The background execution path is implemented and locally verified; proactive production delivery requires the owner setup in [Health alerting](alerting.md).

Before enabling, review/apply migration `0005_clear_jackpot.sql` to the intended database, deploy, configure the providers and authoritative base URL, add the separate Railway Cron service, verify dry-run/disabled runs against real Health, save owner recipients, and explicitly opt in channels/Projects. Any real test is a separate deliberate owner action.

No staging, commits, pushes, tags, version bumps or Releases were performed. Issue #30 remains Open and is ready for Verify/user review. Manual commit is recommended after reviewing the migration and delivery limitations.

The lockfile initially failed `npm ci` because the root entries for existing optional `@emnapi/core` and `@emnapi/runtime` dependencies were missing. Those entries were repaired without changing existing dependency versions; `npm ci --dry-run` passed. `@next/env` is now a direct dependency at its already-installed Next version for the CLI's environment loader.

## Changed files

- `.env.example`
- `CHANGELOG.md`
- `app/projects/[slug]/edit/actions.js`
- `app/settings/notifications/actions.js`
- `app/settings/notifications/page.js`
- `app/settings/page.js`
- `components/notifications/alert-history.js`
- `components/notifications/notification-settings-form.js`
- `components/projects/project-edit-form.js`
- `db/migrations/0005_clear_jackpot.sql`
- `db/migrations/meta/0005_snapshot.json`
- `db/migrations/meta/_journal.json`
- `db/schema.js`
- `docs/alerting.md`
- `docs/architecture.md`
- `docs/issue-30-validation.md`
- `docs/product.md`
- `docs/ux.md`
- `lib/alerts/config.js`
- `lib/alerts/content.js`
- `lib/alerts/database.js`
- `lib/alerts/policy.js`
- `lib/alerts/providers.js`
- `lib/alerts/store.js`
- `lib/alerts/worker.js`
- `lib/projects/edit.js`
- `lib/projects/queries.js`
- `package-lock.json`
- `package.json`
- `scripts/check-alerts.js`
- `tests/integration/alerts.test.js`
- `tests/unit/alerts-security.test.js`
- `tests/unit/alerts.test.js`
