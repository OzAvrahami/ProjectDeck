# Health alerting

ProjectDeck's one-shot Health worker checks configured operational monitors without an open browser. It consumes `observeProjectsHealth()` and the existing normalized Health aggregation. Provider calls, Release/deployment interpretation and Health semantics remain owned by the Health layer. Issues, Needs Attention, Phase, commits, published Releases and release/deployment drift (#22) are not alert inputs.

## Enable deliberately

Global Alerts enabled, each channel, and each Project's **Send Health alerts for this Project** toggle start disabled. All three must be enabled for automatic delivery. Save recipients in **Settings → Notifications**; select Projects from **Edit Project**. Phone numbers require an explicit international country code and are normalized to E.164; national-only numbers are rejected. One email recipient is accepted.

Provider credentials and the SMS sender are server-only environment configuration. They never enter React props, HTML or the history read model. Settings separately show Alerts disabled, Email/SMS provider not configured, invalid base URL, and individual delivery failures. Missing database tables/connectivity is explicit, rather than being presented as disabled settings.

## Trigger rules

| Normalized Health | Incident policy |
| --- | --- |
| Healthy | No new incident; recover an existing active incident once. |
| Down | Open immediately on the first eligible observation. |
| Degraded | Open after a later matching scheduled observation at least **five minutes** after the first Degraded observation. |
| Unknown | Open as **Health unknown** after a later matching scheduled observation at least **ten minutes** after the first Unknown observation. This includes sustained provider/configuration observation failure; it does not mean Down. |
| Not monitored | Never open an incident. Close an existing incident without claiming recovery or sending recovery messages. |

A change in Health resets the confirmation window. Disabled alert observations cannot confirm degradation after enabling. The windows do not assume a five-minute cadence: they require elapsed time and a new matching observation. Overlapping runs and immediate scheduler retries cannot confirm a transient failure. Observation times refer to scheduled check start, not an old deployment event timestamp. Older/equal observations cannot overwrite a newer recorded observation.

Only enabled monitors marked as affecting Project Health participate. Existing multi-component aggregation still makes any required Down monitor Project Down; all Healthy is Healthy; all Unknown is Unknown; mixed/transitional/incomplete Health is Degraded. Sustained normal deployment transitions can therefore alert as Degraded. Notifications carry the affected Component context and evidence-source names, never infer a published or serving version, and never relay arbitrary provider errors or raw connection URLs.

## Persistence and incident lifecycle

Migration `0005_clear_jackpot.sql` adds:

- `projects.health_alerts_enabled`, disabled by default;
- the single-owner `notification_settings` row;
- `health_alert_states` for durable confirmation and observation ordering;
- `health_incidents` with opening/current Health, times, escalation, recovery, closure reason and safe summary;
- `notification_deliveries` for each incident/event/channel, or a separate explicit test request.

An incident opens once, remains active while unhealthy, may escalate to Down **once over its lifetime**, and recovers/closes on Healthy. Down → Degraded → Down cannot repeatedly escalate. A recovered incident stays historical even while recovery delivery retries are pending. A later unhealthy period creates a new incident. Turning off monitoring or alerting closes an active incident without claiming recovery; pending deliveries are cancelled. A message already handed to a provider cannot be recalled.

Project-row locks serialize read/decide/write transactions even before a state row exists. An additional partial unique index permits only one active incident per Project. Incident mutation and per-channel enqueue share the transaction. The delivery unique index covers `(incident_id, channel, notification_type)`; explicit test clicks use a separate unique UUID. This is durable across process restarts and multiple scheduler processes.

Delivery claims use `FOR UPDATE SKIP LOCKED`, persist `sending` and increment attempts **before** any provider request. Sending happens after commit. Only the owner of that attempt can record its outcome. A two-minute abandoned-claim threshold exceeds the 15-second provider request timeout. New escalation/recovery events cancel older pending/retry messages so stale Down messages are not sent after recovery. Enabled state and recipient identity are rechecked at claim time. Changing a recipient cancels that pending delivery; it is not silently rerouted.

The incident/queue transaction makes notification eligibility atomic. External provider acceptance cannot be in the database transaction, so exactly-once arrival at the recipient is not promised.

## Providers, retries and ambiguous acceptance

Both providers use bounded native HTTPS calls; no provider SDK is required. Requests reject redirects. Response bodies, authorization headers and exception dumps are never logged or stored. Each channel has independent status and attempts.

**Email / Resend:** `POST /emails` uses a stable `Idempotency-Key` based on the delivery UUID. The exact sender, recipient, subject, body and absolute link are frozen before its first attempt. Retries reuse that payload even if sender/base URL configuration changes. Resend retains keys for **24 hours**; ProjectDeck stops automatic retry after **23 hours** from the first attempt, including restart recovery. This prevents a delayed retry outside the provider's deduplication window. See [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys) and [Send Email API](https://resend.com/docs/api-reference/emails/send-email).

**SMS / Twilio:** `POST /2010-04-01/Accounts/{AccountSid}/Messages.json` uses Basic authentication and an E.164 sender/recipient. The Message creation API does not document a client idempotency-key contract equivalent to Resend. ProjectDeck therefore treats network timeouts, malformed acceptance, 5xx/408 responses, and abandoned SMS claims as **Acceptance unknown**, with **no automatic resend**. The provider may have accepted the SMS before the client lost the response. Review Twilio logs manually; this conservative choice can leave a message unsent but avoids speculative duplicate SMS. See [Twilio Message API](https://www.twilio.com/docs/messaging/api/message-resource).

Definite retryable responses (429; additionally ambiguous/transient Resend failures protected by its key) get at most **three total attempts**, with at least five minutes between ordinary retries and only on future scheduled runs. There is no retry loop. Authentication/validation rejection is terminal. An unconfigured provider or invalid base URL consumes no attempt and becomes eligible after configuration is repaired, if the event is still relevant. Exhausted, expired, cancelled and uncertain records stay visible. One successful channel is never resent to compensate for another channel's failure.

“Accepted by provider” means an API acceptance was recorded, not confirmed inbox/handset delivery. Provider callbacks and receipt tracking are outside this version.

## History and deliberate tests

Settings → Notifications shows the latest 25 incidents with Project, state, opened/recovered times, closure context and per-event/channel status/attempts. The latest ten tests are separate. The history query excludes payloads, recipients, sender and credentials. Times are UTC. Safe internal provider message IDs are retained in delivery records for operator reconciliation.

**Send test Email** and **Send test SMS** require authenticated access and an explicit click. They use saved recipients, are clearly marked TEST, work independently of the global enable switch, and never create a Health incident. Save first; each new test on a channel has a one-minute cooldown. Replaying the same click cannot resend success. Scheduled jobs never pick up test deliveries; an explicit replay may retry the same failed test subject to its normal limits. Tests with uncertain acceptance must be reviewed manually. Automated tests mock all message providers.

## Server environment

Set on the web application and the scheduled service:

```dotenv
DATABASE_URL=<ProjectDeck Neon PostgreSQL connection>
PROJECTDECK_BASE_URL=https://<public-projectdeck-host>
RESEND_API_KEY=<server-only-key>
PROJECTDECK_ALERT_EMAIL_FROM=<verified-plain-sender-address>
TWILIO_ACCOUNT_SID=<account-SID>
TWILIO_AUTH_TOKEN=<server-only-token>
TWILIO_FROM_NUMBER=<SMS-capable-E.164-number>
```

The base URL must be an absolute HTTPS **origin** in production, without credentials, path, query or fragment. HTTP loopback is allowed only outside production. This reuses the existing Railway OAuth base-URL variable. Public links never use request headers. Configure a verified Resend sending domain/address and a Twilio SMS-capable sender allowed to reach the recipient's destination; trial accounts and destination restrictions must be resolved in those provider consoles.

The worker also needs the same Health credentials used by enabled monitors: legacy `RAILWAY_TOKEN`, `VERCEL_TOKEN`, each configured PostgreSQL monitor's named environment variable, and, for Railway OAuth, `RAILWAY_OAUTH_CLIENT_ID`, `RAILWAY_OAUTH_CLIENT_SECRET`, and the existing stable `PROVIDER_CREDENTIALS_ENCRYPTION_KEY`. Reuse the existing encrypted provider connection in the same database. Health does not require GitHub read or Standard Apply write credentials; do not give the job those solely for alerting. The web service retains `PROJECTDECK_ACCESS_PASSWORD` and `PROJECTDECK_SESSION_SECRET` for private access. The CLI has no public HTTP endpoint and is authorized through deployment/OS access plus server credentials.

Recipients and immutable delivery requests contain personal data in the private database/backups. No contact details or message bodies enter operational logs. Credentials never enter delivery payloads. History is retained until the associated Project is deleted; test history persists separately. There is no automatic retention deletion in v1.

## Run once and validate safely

```sh
npm run alerts:check
npm run alerts:check -- --no-delivery
npm run alerts:check -- --dry-run
```

The command uses Next's environment loader (deployment environment and local `.env*` files), loads only Health inputs, uses existing concurrency (six manual monitors and four Railway service observations), bypasses the short Railway in-process cache for fresh scheduled checks, persists transitions, and handles at most 50 ready candidates per channel (100 total). Email and SMS drain independently so an unconfigured or slow channel cannot starve the other. It closes its PostgreSQL pool in `finally` and exits. PostgreSQL Health probes already close their own clients. There is no interval loop or browser trigger.

`--no-delivery` still records observations/incidents and pending deliveries; it suppresses all provider message requests. Those queued events can be delivered by a later normal run if still relevant. `--dry-run` observes Health but does not write alert state or send messages. Normal Health credential refresh may still occur through the existing provider architecture. Neither option changes the saved settings. Use dry-run for a first read-only production check.

A completed run logs one JSON summary: Projects checked, Health-state counts, incidents opened/escalated/recovered, and per-channel attempted/succeeded/failed counts. Failed prerequisite/database runs exit nonzero with a fixed safe diagnostic. A run can succeed while individual message deliveries fail; inspect the counts and Settings history.

## Owner Railway setup after deployment

No Railway infrastructure is changed by implementing this feature.

1. Review and commit/push the code manually. Keep package version 0.2.0; the feature is Unreleased.
2. Review the migration and confirm the production database target and backup/recovery plan. Separately run `npm run db:migrate` with that target **before serving the new schema-dependent code**. Do not make migration execution part of every scheduled job.
3. Set the web service environment above, deploy, and verify authenticated Notifications settings with alerting still disabled.
4. Add a **separate service** from `OzAvrahami/ProjectDeck` using the same deployed commit/root. Retain the complete repository/runtime dependencies in its image (the worker imports source modules, not only `.next/standalone`). Use the existing build setup; set **Settings → Deploy → Start Command** to `npm run alerts:check -- --dry-run` for the first deployment. Do not change the web service's start command. Give the job no public domain and no web-server healthcheck; configure [restart policy **Never**](https://docs.railway.com/deployments/restart-policy) so recurrence belongs to Cron.
5. Reference/share the same ProjectDeck database and required server-only Health/notification variables. Do not create a separate alert database. Preserve the provider encryption key.
6. Confirm the first dry run logs a Health summary and exits normally. Then use `npm run alerts:check -- --no-delivery` while alert settings remain disabled, and check another clean exit.
7. Set **Settings → Cron Schedule** to `*/5 * * * *`, and set its final Start Command to `npm run alerts:check`. Deploy the pending service settings. Railway uses UTC, permits a minimum interval of five minutes, and start times can vary. If a preceding execution is still running, Railway skips the next execution instead of terminating the prior one. Check exit/run logs. See [Railway Cron Jobs](https://docs.railway.com/cron-jobs) and [worker/queue guidance](https://docs.railway.com/guides/cron-workers-queues).
8. Save the owner's recipient(s), enable desired channels and **Alerts enabled**, then opt in the intended Projects through Edit Project. Existing Down Health becomes immediately alertable at the next poll; Degraded/Unknown first enter confirmation. Enabling does not require deliberately breaking any Project.
9. Review two scheduled runs without opening ProjectDeck. If desired, separately authorize and explicitly click a real test for each channel. No real test is part of this implementation's validation.

Railway Cron provides proactive execution only after the owner performs this setup. ProjectDeck cannot notify about the scheduler itself being stopped or about its own unavailable database while it cannot run; monitor Railway job execution independently.

## Deterministic validation

`npm test` runs unit/security tests with mocked providers. PostgreSQL integration coverage is enabled with an explicitly isolated localhost database named `projectdeck_alert_test`:

```sh
TEST_ALERT_DATABASE_URL=postgres://<test-user>@127.0.0.1:<port>/projectdeck_alert_test npm test
```

That suite applies migrations and clears fixture tables in that isolated database, refusing remote/production targets. It covers real transactional concurrent incident creation/claims, database uniqueness, per-channel retry, crash recovery, immutable Email payloads, ambiguous SMS, cancellation, recovery, Unknown, opt-out, test replays, and Health-only provider loading. It never sends real messages. Run `npm run lint`, `npm run build` and `git diff --check` as well.
