-- The overlap guard.
--
-- Every other rule in this product is a preference. This one is a guarantee:
-- a host is never double-booked, no matter how many people click "Confirm" on
-- the same slot in the same millisecond.
--
-- Application-level checks cannot provide this. Two concurrent transactions
-- both SELECT "no conflicting booking", both see a clean result under READ
-- COMMITTED, and both INSERT. SERIALIZABLE would work but costs retries on
-- every booking; SELECT ... FOR UPDATE does not help either, because there is
-- no existing row to lock — the conflict is with a row that does not exist yet.
-- An exclusion constraint is the one mechanism that resolves this at write
-- time, and it binds every writer, including psql and Drizzle Studio.

-- GiST cannot index scalar equality on its own, so an exclusion constraint
-- mixing `uuid WITH =` and `tstzrange WITH &&` needs the btree_gist operator
-- classes. Available on Supabase and stock Postgres alike.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- Keeps `blocked_period` in lockstep with the booking's times and buffers.
--
-- This is a trigger rather than a GENERATED column on purpose: `timestamptz -
-- interval` is only STABLE (interval arithmetic consults the session TimeZone),
-- and Postgres refuses stable expressions in generated columns. Trigger bodies
-- have no such restriction.
CREATE OR REPLACE FUNCTION bookings_set_blocked_period()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.blocked_period := tstzrange(
    NEW.starts_at - make_interval(mins => NEW.before_buffer_minutes),
    NEW.ends_at   + make_interval(mins => NEW.after_buffer_minutes),
    '[)'  -- half-open, so back-to-back bookings do not read as overlapping
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- Fires only when an input to the computation actually changes. Flipping a
-- booking to 'cancelled' leaves the stored period untouched; the constraint's
-- WHERE clause is what releases the time.
CREATE TRIGGER bookings_blocked_period
  BEFORE INSERT OR UPDATE OF starts_at, ends_at, before_buffer_minutes, after_buffer_minutes
  ON "bookings"
  FOR EACH ROW
  EXECUTE FUNCTION bookings_set_blocked_period();
--> statement-breakpoint

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "host_user_id" WITH =,
    "blocked_period" WITH &&
  )
  -- Cancelled and rejected bookings release their time immediately. Pending
  -- ones do NOT: an event type requiring confirmation still holds the slot
  -- while the host decides, otherwise we would promise the same time to
  -- several people and disappoint all but one of them.
  WHERE ("status" IN ('pending', 'accepted'));
--> statement-breakpoint

COMMENT ON CONSTRAINT "bookings_no_overlap" ON "bookings" IS
  'Prevents double-booking a host. Violations raise SQLSTATE 23P01 and are an expected outcome under contention - see packages/db/src/errors.ts.';
