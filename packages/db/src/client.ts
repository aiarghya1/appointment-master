import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

/**
 * Database client.
 *
 * Two connection strings, because Supabase exposes two poolers and picking the
 * wrong one fails in ways that only show up under load:
 *
 *   - `DATABASE_URL` — the **transaction** pooler (port 6543). Correct for
 *     serverless request handlers, where connections are plentiful and
 *     short-lived. It does not support prepared statements, hence
 *     `prepare: false`; leaving that on produces intermittent
 *     "prepared statement already exists" errors under concurrency.
 *   - `DIRECT_URL` — a direct/session connection (port 5432). Required for
 *     migrations and anything using advisory locks or `LISTEN/NOTIFY`.
 */

declare global {
  // eslint-disable-next-line no-var
  var __schedulerDb: ReturnType<typeof create> | undefined;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    // Required by Supabase's transaction pooler; harmless on a direct connection.
    prepare: false,
  });

  return drizzle(sql, { schema, casing: "snake_case" });
}

/**
 * Reused across hot reloads in development, where module re-evaluation would
 * otherwise open a new pool on every edit and exhaust the server's connections.
 */
export const db = globalThis.__schedulerDb ?? create();
if (process.env.NODE_ENV !== "production") globalThis.__schedulerDb = db;

export type Database = typeof db;
