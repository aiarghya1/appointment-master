import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isBookingConflict } from "./errors";

/**
 * Integration tests for the double-booking guarantee, run against a real
 * Postgres engine (PGlite — Postgres compiled to WASM) rather than a mock.
 *
 * A mock would prove nothing here: the entire claim is about what *Postgres*
 * does under a constraint, so anything that isn't Postgres tests the wrong
 * thing. PGlite gives us genuine engine semantics with no Docker and no
 * service to stand up in CI.
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

let pg: PGlite;

/** Applies every checked-in migration in order — the same SQL production runs. */
async function migrate(client: PGlite) {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.exec(statement);
    }
  }
}

const HOST = "11111111-1111-1111-1111-111111111111";
const OTHER_HOST = "22222222-2222-2222-2222-222222222222";

interface BookingInput {
  uid: string;
  host?: string;
  start: string;
  end: string;
  status?: "pending" | "accepted" | "cancelled" | "rejected";
  beforeBuffer?: number;
  afterBuffer?: number;
}

async function book(input: BookingInput) {
  await pg.query(
    `INSERT INTO bookings
       (uid, host_user_id, title, starts_at, ends_at, attendee_time_zone,
        status, before_buffer_minutes, after_buffer_minutes)
     VALUES ($1, $2, 'Intro call', $3, $4, 'UTC', $5, $6, $7)`,
    [
      input.uid,
      input.host ?? HOST,
      input.start,
      input.end,
      input.status ?? "accepted",
      input.beforeBuffer ?? 0,
      input.afterBuffer ?? 0,
    ],
  );
}

/** Attempts a booking and returns the rejection, or null if it was accepted. */
async function tryBook(input: BookingInput): Promise<unknown | null> {
  try {
    await book(input);
    return null;
  } catch (error) {
    return error;
  }
}

beforeAll(async () => {
  pg = await PGlite.create({ extensions: { btree_gist } });
  await migrate(pg);
  await pg.query(
    `INSERT INTO users (id, email, time_zone) VALUES
       ($1, 'host@example.com', 'UTC'),
       ($2, 'other@example.com', 'UTC')`,
    [HOST, OTHER_HOST],
  );
});

afterAll(async () => {
  await pg?.close();
});

describe("migrations", () => {
  it("applies cleanly and installs the overlap constraint", async () => {
    const result = await pg.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conname = 'bookings_no_overlap'`,
    );
    expect(result.rows).toHaveLength(1);
  });

  it("widens blocked_period by the booking's buffers", async () => {
    await book({
      uid: "buffered-period",
      start: "2026-09-07T10:00:00Z",
      end: "2026-09-07T11:00:00Z",
      beforeBuffer: 15,
      afterBuffer: 30,
      host: OTHER_HOST,
    });
    // Read the bounds in UTC rather than eyeballing the rendered range: the
    // default text form of a tstzrange is written in the session's TimeZone,
    // so asserting on it would test the session, not the trigger.
    const result = await pg.query<{ lo: string; hi: string }>(
      `SELECT to_char(lower(blocked_period) AT TIME ZONE 'UTC', 'HH24:MI') AS lo,
              to_char(upper(blocked_period) AT TIME ZONE 'UTC', 'HH24:MI') AS hi
         FROM bookings WHERE uid = 'buffered-period'`,
    );
    expect(result.rows[0]).toEqual({ lo: "09:45", hi: "11:30" });
  });

  it("recomputes blocked_period when a booking is moved", async () => {
    await pg.query(
      `UPDATE bookings SET starts_at = '2026-09-07T14:00:00Z', ends_at = '2026-09-07T15:00:00Z'
        WHERE uid = 'buffered-period'`,
    );
    const result = await pg.query<{ lo: string; hi: string }>(
      `SELECT to_char(lower(blocked_period) AT TIME ZONE 'UTC', 'HH24:MI') AS lo,
              to_char(upper(blocked_period) AT TIME ZONE 'UTC', 'HH24:MI') AS hi
         FROM bookings WHERE uid = 'buffered-period'`,
    );
    expect(result.rows[0]).toEqual({ lo: "13:45", hi: "15:30" });
  });
});

describe("bookings_no_overlap", () => {
  beforeAll(async () => {
    await book({ uid: "anchor", start: "2026-10-05T10:00:00Z", end: "2026-10-05T11:00:00Z" });
  });

  it("rejects a booking that overlaps an accepted one", async () => {
    const error = await tryBook({
      uid: "overlap",
      start: "2026-10-05T10:30:00Z",
      end: "2026-10-05T11:30:00Z",
    });
    expect(error).not.toBeNull();
    expect(isBookingConflict(error)).toBe(true);
  });

  it("rejects a booking fully contained within another", async () => {
    const error = await tryBook({
      uid: "contained",
      start: "2026-10-05T10:15:00Z",
      end: "2026-10-05T10:45:00Z",
    });
    expect(isBookingConflict(error)).toBe(true);
  });

  it("rejects a booking that swallows another whole", async () => {
    const error = await tryBook({
      uid: "swallows",
      start: "2026-10-05T09:00:00Z",
      end: "2026-10-05T12:00:00Z",
    });
    expect(isBookingConflict(error)).toBe(true);
  });

  it("allows back-to-back bookings, since the range is half-open", async () => {
    expect(
      await tryBook({ uid: "abuts-after", start: "2026-10-05T11:00:00Z", end: "2026-10-05T12:00:00Z" }),
    ).toBeNull();
    expect(
      await tryBook({ uid: "abuts-before", start: "2026-10-05T09:00:00Z", end: "2026-10-05T10:00:00Z" }),
    ).toBeNull();
  });

  it("scopes the constraint to a single host", async () => {
    // The same instant on a different host's calendar is not a conflict.
    expect(
      await tryBook({
        uid: "other-host",
        host: OTHER_HOST,
        start: "2026-10-05T10:00:00Z",
        end: "2026-10-05T11:00:00Z",
      }),
    ).toBeNull();
  });

  it("holds the slot while a booking awaits confirmation", async () => {
    await book({ uid: "pending", start: "2026-10-06T10:00:00Z", end: "2026-10-06T11:00:00Z", status: "pending" });
    const error = await tryBook({
      uid: "pending-collision",
      start: "2026-10-06T10:30:00Z",
      end: "2026-10-06T11:30:00Z",
    });
    expect(isBookingConflict(error)).toBe(true);
  });

  it("releases the slot once a booking is cancelled", async () => {
    await book({ uid: "to-cancel", start: "2026-10-07T10:00:00Z", end: "2026-10-07T11:00:00Z" });
    expect(
      await tryBook({ uid: "blocked-first", start: "2026-10-07T10:00:00Z", end: "2026-10-07T11:00:00Z" }),
    ).not.toBeNull();

    await pg.query(`UPDATE bookings SET status = 'cancelled' WHERE uid = 'to-cancel'`);

    expect(
      await tryBook({ uid: "allowed-after", start: "2026-10-07T10:00:00Z", end: "2026-10-07T11:00:00Z" }),
    ).toBeNull();
  });

  it("enforces buffers, not just the meeting itself", async () => {
    // 10:00–11:00 with a 30-minute trailing buffer occupies until 11:30, so a
    // meeting starting at 11:00 — legal without buffers — must be refused.
    await book({
      uid: "buffered",
      start: "2026-10-08T10:00:00Z",
      end: "2026-10-08T11:00:00Z",
      afterBuffer: 30,
    });
    expect(
      await tryBook({ uid: "inside-buffer", start: "2026-10-08T11:00:00Z", end: "2026-10-08T12:00:00Z" }),
    ).not.toBeNull();
    expect(
      await tryBook({ uid: "clear-of-buffer", start: "2026-10-08T11:30:00Z", end: "2026-10-08T12:30:00Z" }),
    ).toBeNull();
  });

  it("refuses a booking that collides with a row inserted earlier in the same transaction", async () => {
    // The constraint is checked per statement, not deferred to commit — the
    // race is closed at INSERT time, not at COMMIT time.
    await pg.query("BEGIN");
    await book({ uid: "tx-first", start: "2026-10-09T10:00:00Z", end: "2026-10-09T11:00:00Z" });
    const error = await tryBook({
      uid: "tx-second",
      start: "2026-10-09T10:30:00Z",
      end: "2026-10-09T11:30:00Z",
    });
    expect(isBookingConflict(error)).toBe(true);
    await pg.query("ROLLBACK");

    // Nothing from the rolled-back transaction survives.
    const remaining = await pg.query(`SELECT 1 FROM bookings WHERE uid IN ('tx-first', 'tx-second')`);
    expect(remaining.rows).toHaveLength(0);
  });
});

describe("supporting constraints", () => {
  it("refuses a booking that ends before it starts", async () => {
    const error = await tryBook({
      uid: "inverted",
      start: "2026-10-10T11:00:00Z",
      end: "2026-10-10T10:00:00Z",
    });
    expect(error).not.toBeNull();
    expect(isBookingConflict(error)).toBe(false); // a check violation, not an overlap
  });

  it("keeps booking uids unique", async () => {
    await book({ uid: "unique-me", start: "2026-10-11T10:00:00Z", end: "2026-10-11T11:00:00Z" });
    const error = await tryBook({
      uid: "unique-me",
      start: "2026-10-11T14:00:00Z",
      end: "2026-10-11T15:00:00Z",
    });
    expect(error).not.toBeNull();
  });
});
