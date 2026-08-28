import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema/index";

/**
 * Database client.
 *
 * Two backends, chosen by whether `DATABASE_URL` is set:
 *
 *   - **Postgres** (`DATABASE_URL` present) — the real thing, via postgres.js.
 *   - **PGlite** (no `DATABASE_URL`) — Postgres compiled to WASM, running
 *     in-process against a folder on disk. This exists so the app boots with
 *     zero setup: no Docker, no cloud project, no credentials. It is not a
 *     mock or a compatibility layer — it is Postgres, so the exclusion
 *     constraint, the trigger, and `btree_gist` all behave exactly as they will
 *     in production.
 *
 * PGlite is single-connection and in-process, so it is refused outright in
 * production rather than silently becoming a bottleneck.
 *
 * On Supabase, note that the two connection strings are not interchangeable:
 *   - `DATABASE_URL` should be the **transaction** pooler (port 6543), for
 *     request handlers. It does not support prepared statements, hence
 *     `prepare: false`; leaving that on produces intermittent
 *     "prepared statement already exists" errors under concurrency.
 *   - `DIRECT_URL` should be a direct/session connection (port 5432), for
 *     migrations and anything needing advisory locks or LISTEN/NOTIFY.
 */

export type Database = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

declare global {
  // eslint-disable-next-line no-var
  var __schedulerDb: Promise<Database> | undefined;
}

const isProduction = () => process.env.NODE_ENV === "production";

async function createPostgres(url: string): Promise<Database> {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { default: postgres } = await import("postgres");

  const sql = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    // Required by Supabase's transaction pooler; harmless on a direct connection.
    prepare: false,
  });

  return drizzle(sql, { schema, casing: "snake_case" }) as unknown as Database;
}

/**
 * Boots an embedded Postgres and brings it up to date with the checked-in
 * migrations — the same SQL production runs, not a parallel schema definition.
 */
async function createPglite(): Promise<Database> {
  if (isProduction()) {
    throw new Error(
      "DATABASE_URL is required in production. The embedded PGlite database is single-connection and for local development only.",
    );
  }

  const [{ PGlite }, { btree_gist }, { drizzle }, { migrate }, { fileURLToPath }, path] =
    await Promise.all([
      import("@electric-sql/pglite"),
      import("@electric-sql/pglite/contrib/btree_gist"),
      import("drizzle-orm/pglite"),
      import("drizzle-orm/pglite/migrator"),
      import("node:url"),
      import("node:path"),
    ]);

  const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(packageRoot, ".pglite");

  const client = await PGlite.create({ dataDir, extensions: { btree_gist } });
  const db = drizzle(client, { schema, casing: "snake_case" });

  await migrate(db, { migrationsFolder: path.join(packageRoot, "migrations") });

  return db as unknown as Database;
}

function create(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  return url ? createPostgres(url) : createPglite();
}

/**
 * Resolves the shared client, creating it on first use.
 *
 * The promise — not the resolved value — is what gets cached, so concurrent
 * callers during startup await one initialisation rather than racing to open
 * several pools. It is stashed on `globalThis` in development because module
 * re-evaluation on hot reload would otherwise open a new pool on every edit.
 */
export function getDb(): Promise<Database> {
  return (globalThis.__schedulerDb ??= create());
}

/** True when running on the embedded development database. */
export const isEmbeddedDatabase = () => !process.env.DATABASE_URL;
