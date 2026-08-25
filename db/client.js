import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

let database;

export function getDatabase() {
  if (database) {
    return database;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for database access.");
  }

  const sql = neon(databaseUrl);
  database = drizzle({ client: sql, schema });

  return database;
}
