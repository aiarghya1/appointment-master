# Appointment Master

A scheduling platform built for polish and for correctness under contention.

**Live at [appointment-master.vercel.app](https://appointment-master.vercel.app)** —
pick a time with the demo host at
[/arghya](https://appointment-master.vercel.app/arghya):
[15 minutes](https://appointment-master.vercel.app/arghya/intro),
[30 minutes](https://appointment-master.vercel.app/arghya/30min), or an
[hour](https://appointment-master.vercel.app/arghya/deep-dive).

There is no sign-up yet, so that host is seeded demo data and is the only one.
Bookings are real and shared: anything you enter is stored and visible to
anyone else who visits, so do not put anything private in it.

## Layout

```
apps/web                 Next.js 16 (App Router) — booking pages, dashboard, API
packages/availability    The scheduling engine. Pure, no I/O, no clock.
packages/calendar        iCalendar invitation building. Pure, byte-for-byte tested.
packages/db              Drizzle schema, migrations, and the overlap guard.
```

## Getting started

```bash
npm install
```

```bash
npm test
```

Tests need no database and no Docker: the engine is pure, and the schema tests
run against PGlite (Postgres compiled to WASM) in-process.

To run the app you will need a Postgres database — copy `.env.example` to
`.env` and fill it in, then:

```bash
npm run generate --workspace @appointment-master/db && npm run migrate --workspace @appointment-master/db
```

## Three decisions worth knowing about

**Availability is wall-clock time, never UTC.** A host who says "9am on
Mondays" means 9am in their zone on both sides of a DST transition, even though
the underlying instant moves by an hour. Schedules therefore store minutes from
local midnight plus an IANA zone name, and convert to instants only at slot
generation. Storing UTC or a fixed offset is the standard way scheduling
products break twice a year.

**The engine is a pure function.** `generateSlots` takes rules, overrides, busy
time, event configuration, and `now`, and returns slots. It reads no database,
makes no network call, and never consults the ambient clock or zone. That is
what makes DST behaviour testable rather than merely hoped for — the suite
covers both transition directions in both hemispheres, half-hour zones, and
Lord Howe's 30-minute DST shift, plus property-based invariants over randomised
schedules. The test runner pins `TZ=Pacific/Chatham` so any accidental
dependency on ambient state fails immediately.

**Double-booking is prevented by Postgres, not by application code.** Two
requests for the last slot can both read "free" before either writes, so
check-then-insert loses the race however carefully it is written — and row
locks do not help, because the conflicting row does not exist yet. Instead each
booking stores the span it occupies (buffers included) as a `tstzrange`, and an
`EXCLUDE USING gist` constraint refuses to store two overlapping spans for the
same host. Losing the race raises SQLSTATE `23P01`, which the booking flow
treats as an ordinary outcome: refresh availability, tell the attendee the slot
just went.

That span is maintained by a `BEFORE` trigger rather than a generated column,
because `timestamptz - interval` is only `STABLE` — interval arithmetic
consults the session TimeZone — and Postgres bars stable expressions from
generated columns. Keeping it in the database means every writer gets it,
including psql and Drizzle Studio.

## Deploying

The app builds without a database — every route that reads one is rendered on
demand, so nothing touches Postgres at build time. It will not *run* without
one: the embedded PGlite database is refused in production, since it is
single-connection and, on ephemeral filesystems, would lose every booking when
the process recycled.

### Render (blueprint)

`render.yaml` declares the database and the web service together, so the
connection string is wired from one to the other and never copied by hand.

1. Render dashboard → **New** → **Blueprint** → select this repository.
2. Apply. Render provisions Postgres, builds, runs the migrations, and starts
   the server.

Migrations run from the start command rather than the build. They are
idempotent, so a restart re-checks and does nothing. If you scale past a single
instance, move them to a `preDeployCommand` so concurrent boots cannot race.

### Vercel

Vercel is serverless, so there is no start command to hang migrations off.
`vercel.json` folds them into the build instead:

```json
"buildCommand": "npm run migrate --workspace @appointment-master/db && npm run build"
```

Set `DATABASE_URL` and `DIRECT_URL` on the project before the first deploy —
the build runs migrations, so it fails fast rather than shipping a site that
cannot reach its database. Any Postgres works; the marketplace integrations
wire the pooled URL automatically, but `DIRECT_URL` still has to be set by hand
from the provider's direct (unpooled) connection string, because migrations
need locks the transaction pooler cannot hold.

### Email invitations

A confirmed booking emails the attendee an `.ics` invitation, so the time is
blocked wherever they keep their calendar rather than only in this database.
Two variables turn it on:

```bash
RESEND_API_KEY="re_..."
EMAIL_FROM="bookings@your-verified-domain.com"
```

`EMAIL_FROM` must be on a domain verified with the provider; an unverified
sender is rejected outright. With neither set — the normal state for a local
checkout — bookings still succeed and simply send nothing, because the meeting
is already committed by the time the email is attempted and a mail outage must
never cost someone their booking.

The invitation is `METHOD:REQUEST` and carries the booking's own UID, so a
future reschedule or cancellation for that UID replaces the calendar entry
instead of leaving a duplicate behind.

### Anywhere else

Any Node host plus any Postgres 14+ works. Provide two variables — they may be
the same URL, and are only distinct where the provider separates pooled from
direct connections (on Supabase, `DATABASE_URL` is the transaction pooler on
6543 and `DIRECT_URL` the session pooler on 5432, because the transaction
pooler cannot hold the locks migrations need):

```bash
npm run migrate --workspace @appointment-master/db
npm run build
npm run start --workspace @appointment-master/web
```

The database must allow `CREATE EXTENSION btree_gist`, which the overlap
constraint depends on.

Seeding is optional and destructive — it deletes all existing data — so
against a remote database it refuses unless you pass `SEED_CONFIRM=yes`.

## Status

Foundation, scheduling core, and attendee email invitations are in place. Auth
and tenancy, two-way calendar sync, host notifications and reminders, team
scheduling, payments and workflows, and the public API and embeds follow in
that order.
