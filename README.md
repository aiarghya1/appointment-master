# Appointment Master

A scheduling platform built for polish and for correctness under contention.

## Layout

```
apps/web                 Next.js 16 (App Router) — booking pages, dashboard, API
packages/availability    The scheduling engine. Pure, no I/O, no clock.
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

## Status

Foundation and scheduling core are in place. Auth and tenancy, calendar sync,
notifications, team scheduling, payments and workflows, and the public API and
embeds follow in that order.
