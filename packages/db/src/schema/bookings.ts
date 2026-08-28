import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./identity";
import { eventTypes } from "./scheduling";

/**
 * Bookings — and the one guarantee this product cannot get wrong.
 *
 * Double-booking is a concurrency problem, not a validation problem. Two
 * requests for the last slot can both read "free" before either writes, so any
 * check-then-insert in application code loses the race no matter how carefully
 * it is written. The only durable fix is to make the overlap unrepresentable:
 * a `tstzrange` of the time each booking occupies, and a Postgres EXCLUDE
 * constraint that refuses to store two overlapping ranges for the same host.
 *
 * The constraint itself is declared in `migrations/0001_booking_overlap_guard.sql`
 * because Drizzle's DSL cannot express EXCLUDE. The generated column is modelled
 * here so drizzle-kit knows it exists and does not try to drop it.
 */

const tstzrange = customType<{ data: string; driverData: string }>({
  dataType: () => "tstzrange",
});

export const bookingStatus = pgEnum("booking_status", [
  "pending",
  "accepted",
  "cancelled",
  "rejected",
]);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /**
     * Public, unguessable handle used in confirmation links and ICS UIDs.
     * Kept separate from the primary key so internal ids never leak into
     * emails or calendar entries.
     */
    uid: text("uid").notNull(),

    eventTypeId: uuid("event_type_id").references(() => eventTypes.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    /** The host whose calendar this occupies. Round-robin resolves to one row per host. */
    hostUserId: uuid("host_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    description: text("description"),
    location: jsonb("location"),

    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),

    /**
     * Buffers are snapshotted from the event type at booking time rather than
     * read through a join. Editing an event type must never retroactively make
     * an existing booking overlap something — history stays as it was agreed.
     */
    beforeBufferMinutes: integer("before_buffer_minutes").notNull().default(0),
    afterBufferMinutes: integer("after_buffer_minutes").notNull().default(0),

    /**
     * The real span of time this booking takes off the host's calendar,
     * buffers included. This is the column the exclusion constraint guards.
     *
     * Maintained by a BEFORE INSERT/UPDATE trigger, never by application code.
     * It cannot be a GENERATED column: subtracting an `interval` from a
     * `timestamptz` is only STABLE, not IMMUTABLE, because interval arithmetic
     * consults the session TimeZone — and Postgres rejects stable expressions
     * in generated columns. A trigger has no such restriction, and keeping the
     * computation in the database means every writer gets it, including psql
     * and Drizzle Studio.
     *
     * The default is a placeholder the trigger overwrites on the way in; it
     * exists only so callers are not forced to supply a value they must not set.
     */
    blockedPeriod: tstzrange("blocked_period")
      .notNull()
      .default(sql`'empty'::tstzrange`),

    status: bookingStatus("status").notNull().default("accepted"),
    /** The zone the attendee booked in, so we can render times back as they saw them. */
    attendeeTimeZone: text("attendee_time_zone").notNull(),

    cancellationReason: text("cancellation_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** Set when this booking replaces an earlier one, forming a reschedule chain. */
    rescheduledFromId: uuid("rescheduled_from_id"),

    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("bookings_uid_key").on(t.uid),
    // Serves the hot path: "what is this host busy with over this window?"
    index("bookings_host_starts_idx").on(t.hostUserId, t.startsAt),
    index("bookings_event_type_idx").on(t.eventTypeId),
    check("bookings_ordered", sql`${t.endsAt} > ${t.startsAt}`),
    check(
      "bookings_non_negative_buffers",
      sql`${t.beforeBufferMinutes} >= 0 AND ${t.afterBufferMinutes} >= 0`,
    ),
  ],
);

export const bookingAttendees = pgTable(
  "booking_attendees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    timeZone: text("time_zone").notNull(),
    locale: text("locale").notNull().default("en"),
    /** Recorded after the fact; drives no-show rates and round-robin fairness. */
    noShow: boolean("no_show").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("booking_attendees_booking_idx").on(t.bookingId)],
);

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  eventType: one(eventTypes, { fields: [bookings.eventTypeId], references: [eventTypes.id] }),
  host: one(users, { fields: [bookings.hostUserId], references: [users.id] }),
  organization: one(organizations, {
    fields: [bookings.organizationId],
    references: [organizations.id],
  }),
  rescheduledFrom: one(bookings, {
    fields: [bookings.rescheduledFromId],
    references: [bookings.id],
    relationName: "reschedule_chain",
  }),
  attendees: many(bookingAttendees),
}));

export const bookingAttendeesRelations = relations(bookingAttendees, ({ one }) => ({
  booking: one(bookings, { fields: [bookingAttendees.bookingId], references: [bookings.id] }),
}));
