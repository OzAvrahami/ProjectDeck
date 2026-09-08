import Link from "next/link";
import { HEALTH_LABELS } from "../../lib/health/model.js";

function time(value) { return value ? new Date(value).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—"; }
const STATUS = { pending: "Pending", sending: "Sending", sent: "Accepted by provider", retry: "Retry scheduled", failed: "Delivery failed", uncertain: "Acceptance unknown — review provider", unconfigured: "Not configured", cancelled: "Cancelled" };
const FAILURE = { provider_unconfigured: "Provider not configured", base_url_unconfigured: "ProjectDeck URL not configured", authentication_failed: "Provider authentication failed", rate_limited: "Provider rate limit", request_rejected: "Provider rejected request", provider_acceptance_unknown: "Provider may have accepted the message", retry_window_expired: "Safe retry window expired", attempts_exhausted: "Attempt limit reached", recipient_changed: "Recipient changed", alerts_disabled: "Alerts disabled", superseded: "Superseded by a newer Health event" };
const EVENT = { incident_opened: "Opened", incident_escalated: "Escalated", incident_recovered: "Recovered", test: "TEST" };

function Delivery({ delivery }) {
  return <li className="text-xs leading-6">
    <span className="font-semibold">{delivery.channel === "email" ? "Email" : "SMS"} · {EVENT[delivery.notificationType]}</span>
    {" — "}{STATUS[delivery.status] ?? "Unknown"} · {delivery.attempts} attempt(s)
    {delivery.failureClassification ? <span className="block text-muted">{FAILURE[delivery.failureClassification] ?? "Check server configuration"}</span> : null}
  </li>;
}

export function AlertHistory({ history }) {
  return <section className="mt-10 space-y-5" aria-labelledby="alert-history">
    <h2 id="alert-history" className="text-lg font-semibold">Recent Health incidents</h2>
    <p className="text-xs leading-5 text-muted">Accepted means the provider accepted the message; receipt at the inbox or handset is not verified. Times are UTC. Latest 25 incidents.</p>
    {history.incidents.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr className="border-b border-line">{["Project", "State", "Opened", "Recovered", "Channels / delivery status"].map((label) => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
      <tbody>{history.incidents.map((incident) => <tr key={incident.id} className="border-b border-line align-top">
        <td className="p-3"><Link href={`/projects/${incident.slug}`} className="underline">{incident.projectName}</Link></td>
        <td className="p-3">{incident.recoveredAt ? "Recovered · Closed" : incident.closedAt ? "Closed without recovery" : `Active · ${HEALTH_LABELS[incident.state]}`}<p className="mt-1 text-xs text-muted">{incident.closureReason === "not_monitored" ? "Monitoring disabled" : incident.closureReason === "alerts_disabled" ? "Alerts disabled" : null}</p></td>
        <td className="whitespace-nowrap p-3 text-xs">{time(incident.openedAt)}</td>
        <td className="whitespace-nowrap p-3 text-xs">{time(incident.recoveredAt)}</td>
        <td className="min-w-56 p-3">{incident.deliveries.length ? <ul>{incident.deliveries.map((delivery) => <Delivery key={delivery.id} delivery={delivery} />)}</ul> : "No channels enabled"}</td>
      </tr>)}</tbody>
    </table></div> : <p className="text-sm text-muted">No Health incidents recorded.</p>}
    <h3 className="pt-4 text-base font-semibold">Test history</h3>
    {history.tests.length ? <ul className="divide-y divide-line">{history.tests.map((delivery) => <li key={delivery.id} className="py-3"><p className="text-xs text-muted">{time(delivery.createdAt)}</p><ul><Delivery delivery={delivery} /></ul></li>)}</ul> : <p className="text-sm text-muted">No test notifications recorded.</p>}
  </section>;
}
