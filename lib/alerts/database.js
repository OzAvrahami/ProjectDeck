import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../../db/schema.js";

let connection;
// Interactive transactions/row locks are required here; Neon HTTP's batch API
// cannot safely perform the read/decide/write incident transition.
export function openAlertDatabase(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is required for alert persistence.");
  const client = postgres(url, { max: 3, connect_timeout: 10, idle_timeout: 20, onnotice: () => {}, connection: { statement_timeout: 30_000 } });
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) };
}
export function getAlertDatabase() {
  connection ??= openAlertDatabase();
  return connection.db;
}
export async function closeAlertDatabase() {
  if (connection) await connection.close();
  connection = undefined;
}
