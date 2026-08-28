import "server-only";

import {
  generateSlots,
  type Interval,
  type Schedule,
  type Weekday,
} from "@scheduler/availability";
import { getDb, schema } from "@scheduler/db";
import { and, eq, gt, inArray, lt } from "drizzle-orm";

/**
 * The read path from database rows to bookable slots.
 *
 * This module's whole job is translation: load what the host configured, hand
 * it to the engine in the engine's own vocabulary, and return instants. All
 * scheduling logic lives in `@scheduler/availability` — nothing here decides
 * when someone is free.
 */

export interface PublicEventType {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  slotIntervalMinutes: number | null;
  beforeBufferMinutes: number;
  afterBufferMinutes: number;
  minimumNoticeMinutes: number;
  offsetMinutes: number;
  rollingWindowDays: number | null;
  requiresConfirmation: boolean;
  host: {
    id: string;
    name: string | null;
    username: string | null;
    timeZone: string;
  };
  scheduleId: string | null;
  scheduleTimeZone: string;
}

export async function loadPublicEventType(
  username: string,
  slug: string,
): Promise<PublicEventType | null> {
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.eventTypes.id,
      slug: schema.eventTypes.slug,
      title: schema.eventTypes.title,
      description: schema.eventTypes.description,
      durationMinutes: schema.eventTypes.durationMinutes,
      slotIntervalMinutes: schema.eventTypes.slotIntervalMinutes,
      beforeBufferMinutes: schema.eventTypes.beforeBufferMinutes,
      afterBufferMinutes: schema.eventTypes.afterBufferMinutes,
      minimumNoticeMinutes: schema.eventTypes.minimumNoticeMinutes,
      offsetMinutes: schema.eventTypes.offsetMinutes,
      rollingWindowDays: schema.eventTypes.rollingWindowDays,
      requiresConfirmation: schema.eventTypes.requiresConfirmation,
      hidden: schema.eventTypes.hidden,
      hostId: schema.users.id,
      hostName: schema.users.name,
      hostUsername: schema.users.username,
      hostTimeZone: schema.users.timeZone,
      scheduleId: schema.schedules.id,
      scheduleTimeZone: schema.schedules.timeZone,
    })
    .from(schema.eventTypes)
    .innerJoin(schema.users, eq(schema.eventTypes.userId, schema.users.id))
    .leftJoin(schema.schedules, eq(schema.eventTypes.scheduleId, schema.schedules.id))
    .where(and(eq(schema.users.username, username), eq(schema.eventTypes.slug, slug)))
    .limit(1);

  const row = rows[0];
  if (!row || row.hidden) return null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    durationMinutes: row.durationMinutes,
    slotIntervalMinutes: row.slotIntervalMinutes,
    beforeBufferMinutes: row.beforeBufferMinutes,
    afterBufferMinutes: row.afterBufferMinutes,
    minimumNoticeMinutes: row.minimumNoticeMinutes,
    offsetMinutes: row.offsetMinutes,
    rollingWindowDays: row.rollingWindowDays,
    requiresConfirmation: row.requiresConfirmation,
    host: {
      id: row.hostId,
      name: row.hostName,
      username: row.hostUsername,
      timeZone: row.hostTimeZone,
    },
    scheduleId: row.scheduleId,
    // A host with no schedule attached falls back to their own zone, which at
    // least renders sensibly rather than throwing on an unknown zone.
    scheduleTimeZone: row.scheduleTimeZone ?? row.hostTimeZone,
  };
}

export async function loadHostEventTypes(username: string) {
  const db = await getDb();
  return db
    .select({
      slug: schema.eventTypes.slug,
      title: schema.eventTypes.title,
      description: schema.eventTypes.description,
      durationMinutes: schema.eventTypes.durationMinutes,
      hostName: schema.users.name,
      hostUsername: schema.users.username,
    })
    .from(schema.eventTypes)
    .innerJoin(schema.users, eq(schema.eventTypes.userId, schema.users.id))
    .where(and(eq(schema.users.username, username), eq(schema.eventTypes.hidden, false)))
    .orderBy(schema.eventTypes.position);
}

async function loadSchedule(
  scheduleId: string | null,
  fallbackTimeZone: string,
): Promise<Schedule> {
  if (!scheduleId) return { timeZone: fallbackTimeZone, rules: [] };

  const db = await getDb();
  const [rules, overrides] = await Promise.all([
    db
      .select()
      .from(schema.availabilityRules)
      .where(eq(schema.availabilityRules.scheduleId, scheduleId)),
    db.select().from(schema.dateOverrides).where(eq(schema.dateOverrides.scheduleId, scheduleId)),
  ]);

  const [scheduleRow] = await db
    .select({ timeZone: schema.schedules.timeZone })
    .from(schema.schedules)
    .where(eq(schema.schedules.id, scheduleId))
    .limit(1);

  // Several rows may share a date — one per window on a partially-available
  // day — so overrides are grouped before being handed to the engine. A row
  // with null bounds marks the date unavailable, which is an empty interval
  // list rather than an absent override.
  const grouped = new Map<string, { start: number; end: number }[]>();
  for (const override of overrides) {
    const list = grouped.get(override.date) ?? [];
    if (override.startMinute !== null && override.endMinute !== null) {
      list.push({ start: override.startMinute, end: override.endMinute });
    }
    grouped.set(override.date, list);
  }

  return {
    timeZone: scheduleRow?.timeZone ?? fallbackTimeZone,
    rules: rules.map((r) => ({
      weekday: r.weekday as Weekday,
      start: r.startMinute,
      end: r.endMinute,
    })),
    overrides: [...grouped].map(([date, intervals]) => ({ date, intervals })),
  };
}

/**
 * Everything already committed on the host's calendar over a window.
 *
 * Each booking is widened by its own stored buffers, mirroring exactly what
 * `blocked_period` holds in the database — so the slots we offer agree with
 * what the exclusion constraint will actually accept.
 */
async function loadBusy(hostUserId: string, window: Interval): Promise<Interval[]> {
  const db = await getDb();
  const rows = await db
    .select({
      startsAt: schema.bookings.startsAt,
      endsAt: schema.bookings.endsAt,
      beforeBufferMinutes: schema.bookings.beforeBufferMinutes,
      afterBufferMinutes: schema.bookings.afterBufferMinutes,
    })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.hostUserId, hostUserId),
        inArray(schema.bookings.status, ["pending", "accepted"]),
        lt(schema.bookings.startsAt, window.end),
        gt(schema.bookings.endsAt, window.start),
      ),
    );

  return rows.map((b) => ({
    start: new Date(b.startsAt.getTime() - b.beforeBufferMinutes * 60_000),
    end: new Date(b.endsAt.getTime() + b.afterBufferMinutes * 60_000),
  }));
}

export async function loadSlots(
  eventType: PublicEventType,
  window: Interval,
  now = new Date(),
): Promise<Interval[]> {
  const [schedule, busy] = await Promise.all([
    loadSchedule(eventType.scheduleId, eventType.scheduleTimeZone),
    loadBusy(eventType.host.id, window),
  ]);

  // A rolling window caps how far ahead bookings are taken. Clamping the query
  // window is equivalent to filtering afterwards and avoids the work.
  const horizon = eventType.rollingWindowDays
    ? new Date(now.getTime() + eventType.rollingWindowDays * 86_400_000)
    : window.end;
  const end = new Date(Math.min(window.end.getTime(), horizon.getTime()));
  if (end <= window.start) return [];

  return generateSlots({
    window: { start: window.start, end },
    now,
    schedule,
    eventType: {
      durationMinutes: eventType.durationMinutes,
      ...(eventType.slotIntervalMinutes !== null
        ? { slotIntervalMinutes: eventType.slotIntervalMinutes }
        : {}),
      beforeBufferMinutes: eventType.beforeBufferMinutes,
      afterBufferMinutes: eventType.afterBufferMinutes,
      minimumNoticeMinutes: eventType.minimumNoticeMinutes,
      offsetMinutes: eventType.offsetMinutes,
    },
    busy,
  });
}
