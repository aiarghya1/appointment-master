import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./identity";

/**
 * Schedules, availability, and event types.
 *
 * The storage model mirrors `@scheduler/availability` exactly: recurring rules
 * hold wall-clock minutes, the IANA zone lives on the parent schedule, and
 * nothing here stores a UTC instant. The engine reads these rows verbatim.
 */

export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Working Hours"),
    /**
     * IANA zone that every rule and override under this schedule is expressed
     * in. Changing it re-interprets the wall-clock times rather than shifting
     * them, which is what a host relocating actually wants.
     */
    timeZone: text("time_zone").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("schedules_user_idx").on(t.userId),
    // At most one default per user. Postgres treats NULLs as distinct, so the
    // partial unique index only constrains rows that actually claim the flag.
    uniqueIndex("schedules_one_default_per_user")
      .on(t.userId)
      .where(sql`${t.isDefault}`),
  ],
);

export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    /** ISO-8601 weekday: 1 = Monday … 7 = Sunday. */
    weekday: smallint("weekday").notNull(),
    /** Minutes from local midnight. */
    startMinute: integer("start_minute").notNull(),
    /**
     * Minutes from local midnight, exclusive. May exceed 1440 to express a
     * window crossing midnight — 22:00–02:00 is stored as 1320 → 1560.
     */
    endMinute: integer("end_minute").notNull(),
  },
  (t) => [
    index("availability_rules_schedule_idx").on(t.scheduleId),
    check("availability_rules_weekday_range", sql`${t.weekday} BETWEEN 1 AND 7`),
    check("availability_rules_bounds", sql`${t.startMinute} >= 0 AND ${t.endMinute} <= 2880`),
    check("availability_rules_ordered", sql`${t.endMinute} > ${t.startMinute}`),
  ],
);

export const dateOverrides = pgTable(
  "date_overrides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    /** Calendar date in the schedule's zone, not UTC. */
    date: date("date").notNull(),
    /**
     * Both NULL marks the date as unavailable outright. That is distinct from
     * having no override row at all, which falls through to the weekly rules.
     */
    startMinute: integer("start_minute"),
    endMinute: integer("end_minute"),
  },
  (t) => [
    index("date_overrides_schedule_date_idx").on(t.scheduleId, t.date),
    check(
      "date_overrides_both_or_neither",
      sql`(${t.startMinute} IS NULL) = (${t.endMinute} IS NULL)`,
    ),
    check(
      "date_overrides_ordered",
      sql`${t.startMinute} IS NULL OR ${t.endMinute} > ${t.startMinute}`,
    ),
  ],
);

/** How hosts are assigned when an event type has more than one. */
export const schedulingType = pgEnum("scheduling_type", ["individual", "collective", "round_robin"]);

export const eventTypes = pgTable(
  "event_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Personal event types hang off a user; team ones off an organization. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    scheduleId: uuid("schedule_id").references(() => schedules.id, { onDelete: "set null" }),

    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),

    durationMinutes: integer("duration_minutes").notNull(),
    /** Spacing of offered start times. NULL means "same as the duration". */
    slotIntervalMinutes: integer("slot_interval_minutes"),
    beforeBufferMinutes: integer("before_buffer_minutes").notNull().default(0),
    afterBufferMinutes: integer("after_buffer_minutes").notNull().default(0),
    minimumNoticeMinutes: integer("minimum_notice_minutes").notNull().default(0),
    offsetMinutes: integer("offset_minutes").notNull().default(0),

    /** How far ahead bookings are accepted. NULL means unbounded. */
    rollingWindowDays: integer("rolling_window_days"),

    schedulingType: schedulingType("scheduling_type").notNull().default("individual"),
    /** Location options — in person, phone, Meet, Teams, custom link. */
    locations: jsonb("locations").notNull().default(sql`'[]'::jsonb`),
    requiresConfirmation: boolean("requires_confirmation").notNull().default(false),
    hidden: boolean("hidden").notNull().default(false),
    position: integer("position").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Slugs are unique per owner. Two partial indexes rather than one, because
    // exactly one of the owner columns is populated on any given row.
    uniqueIndex("event_types_user_slug_key")
      .on(t.userId, t.slug)
      .where(sql`${t.userId} IS NOT NULL`),
    uniqueIndex("event_types_org_slug_key")
      .on(t.organizationId, t.slug)
      .where(sql`${t.organizationId} IS NOT NULL`),
    check(
      "event_types_single_owner",
      sql`(${t.userId} IS NOT NULL) <> (${t.organizationId} IS NOT NULL)`,
    ),
    check("event_types_positive_duration", sql`${t.durationMinutes} > 0`),
    check(
      "event_types_positive_interval",
      sql`${t.slotIntervalMinutes} IS NULL OR ${t.slotIntervalMinutes} > 0`,
    ),
  ],
);

/** Which users can host a given event type, and in what order for round-robin. */
export const eventTypeHosts = pgTable(
  "event_type_hosts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventTypeId: uuid("event_type_id")
      .notNull()
      .references(() => eventTypes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Round-robin only: higher values receive proportionally more bookings. */
    weight: integer("weight").notNull().default(100),
    /** Collective events require every mandatory host to be free. */
    mandatory: boolean("mandatory").notNull().default(false),
  },
  (t) => [uniqueIndex("event_type_hosts_key").on(t.eventTypeId, t.userId)],
);

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
  user: one(users, { fields: [schedules.userId], references: [users.id] }),
  rules: many(availabilityRules),
  overrides: many(dateOverrides),
}));

export const availabilityRulesRelations = relations(availabilityRules, ({ one }) => ({
  schedule: one(schedules, {
    fields: [availabilityRules.scheduleId],
    references: [schedules.id],
  }),
}));

export const dateOverridesRelations = relations(dateOverrides, ({ one }) => ({
  schedule: one(schedules, { fields: [dateOverrides.scheduleId], references: [schedules.id] }),
}));

export const eventTypesRelations = relations(eventTypes, ({ one, many }) => ({
  user: one(users, { fields: [eventTypes.userId], references: [users.id] }),
  organization: one(organizations, {
    fields: [eventTypes.organizationId],
    references: [organizations.id],
  }),
  schedule: one(schedules, { fields: [eventTypes.scheduleId], references: [schedules.id] }),
  hosts: many(eventTypeHosts),
}));

export const eventTypeHostsRelations = relations(eventTypeHosts, ({ one }) => ({
  eventType: one(eventTypes, {
    fields: [eventTypeHosts.eventTypeId],
    references: [eventTypes.id],
  }),
  user: one(users, { fields: [eventTypeHosts.userId], references: [users.id] }),
}));
