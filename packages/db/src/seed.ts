import { getDb } from "./client";
import {
  availabilityRules,
  bookings,
  eventTypes,
  schedules,
  users,
} from "./schema/index";

/**
 * Development seed.
 *
 * Creates one host with a realistic working week and a few event types, plus a
 * couple of existing bookings so the booking page has visible gaps rather than
 * a suspiciously perfect grid.
 *
 * Idempotent: running it twice resets the demo data rather than duplicating it.
 */

const HOST_ID = "00000000-0000-4000-8000-000000000001";
const SCHEDULE_ID = "00000000-0000-4000-8000-000000000002";

/** Monday–Friday, 09:00–17:00 with an hour blocked out for lunch. */
const WORKING_WEEK = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, startMinute: 9 * 60, endMinute: 13 * 60 },
  { weekday, startMinute: 14 * 60, endMinute: 17 * 60 },
]);

const EVENT_TYPES = [
  {
    slug: "intro",
    title: "Intro Call",
    description: "A quick hello to work out whether we should talk properly.",
    durationMinutes: 15,
    slotIntervalMinutes: 15,
    beforeBufferMinutes: 0,
    afterBufferMinutes: 0,
    minimumNoticeMinutes: 120,
    position: 0,
  },
  {
    slug: "30min",
    title: "30 Minute Meeting",
    description: "The default. Enough time to get somewhere without rushing.",
    durationMinutes: 30,
    slotIntervalMinutes: 30,
    beforeBufferMinutes: 5,
    afterBufferMinutes: 5,
    minimumNoticeMinutes: 240,
    position: 1,
  },
  {
    slug: "deep-dive",
    title: "Deep Dive",
    description: "An hour with buffers either side, for work that needs room.",
    durationMinutes: 60,
    slotIntervalMinutes: 30,
    beforeBufferMinutes: 15,
    afterBufferMinutes: 15,
    minimumNoticeMinutes: 60 * 24,
    position: 2,
  },
];

/** A booking `days` from today at `hour` UTC, so the demo always has conflicts. */
function upcoming(days: number, hour: number, lengthMinutes: number) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + days);
  start.setUTCHours(hour, 0, 0, 0);
  return { start, end: new Date(start.getTime() + lengthMinutes * 60_000) };
}

async function seed() {
  // This script's first act is to delete every user, which cascades to every
  // schedule, event type, and booking in the database. That is harmless against
  // the embedded development database and catastrophic against a real one, so
  // pointing it at a remote database requires saying so out loud.
  if (process.env.DATABASE_URL && process.env.SEED_CONFIRM !== "yes") {
    throw new Error(
      "Refusing to seed: DATABASE_URL is set, and seeding DELETES ALL EXISTING DATA.\n" +
        "Re-run with SEED_CONFIRM=yes if that is genuinely what you want.",
    );
  }

  const db = await getDb();

  // Cascades clear schedules, rules, event types, and bookings with the host.
  await db.delete(users);

  await db.insert(users).values({
    id: HOST_ID,
    email: "arghya@example.com",
    name: "Arghya Polley",
    username: "arghya",
    timeZone: "Asia/Kolkata",
  });

  await db.insert(schedules).values({
    id: SCHEDULE_ID,
    userId: HOST_ID,
    name: "Working Hours",
    timeZone: "Asia/Kolkata",
    isDefault: true,
  });

  await db
    .insert(availabilityRules)
    .values(WORKING_WEEK.map((rule) => ({ ...rule, scheduleId: SCHEDULE_ID })));

  await db
    .insert(eventTypes)
    .values(EVENT_TYPES.map((e) => ({ ...e, userId: HOST_ID, scheduleId: SCHEDULE_ID })));

  const existing = [upcoming(2, 5, 60), upcoming(3, 6, 30), upcoming(4, 8, 90)];
  await db.insert(bookings).values(
    existing.map((slot, i) => ({
      uid: `seed-booking-${i}`,
      hostUserId: HOST_ID,
      title: "Existing commitment",
      startsAt: slot.start,
      endsAt: slot.end,
      attendeeTimeZone: "UTC",
    })),
  );

  console.log(
    `Seeded host @arghya with ${EVENT_TYPES.length} event types, ` +
      `${WORKING_WEEK.length} availability rules, and ${existing.length} existing bookings.`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
