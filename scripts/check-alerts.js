// Run with the react-server condition to honor server-only module boundaries
// outside Next.js. Use the same environment loader as the web application.
import nextEnvironment from "@next/env";
import { closeAlertDatabase } from "../lib/alerts/database.js";
import { checkAllProjectAlerts } from "../lib/alerts/worker.js";

nextEnvironment.loadEnvConfig(process.cwd());

const flags = new Set(process.argv.slice(2));
try {
  if ([...flags].some((flag) => !["--no-delivery", "--dry-run"].includes(flag))) throw new Error("Unsupported option.");
  const result = await checkAllProjectAlerts({ deliveryDisabled: flags.has("--no-delivery"), dryRun: flags.has("--dry-run") });
  console.log(JSON.stringify({ event: "health_alert_check", ...result }));
} catch {
  console.error(JSON.stringify({ event: "health_alert_check_failed", reason: "Check database connectivity, migrations and server configuration." }));
  process.exitCode = 1;
} finally {
  await closeAlertDatabase();
}
