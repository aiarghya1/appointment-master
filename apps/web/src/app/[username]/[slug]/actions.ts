"use server";

import { isBookingConflict, getDb, schema } from "@scheduler/db";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { loadPublicEventType, loadSlots } from "@/server/booking";
import { isValidZone } from "@/lib/time";

export interface BookingFormState {
  error?: string;
  /** Set when the slot went while the attendee was filling the form. */
  conflict?: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createBooking(
  _previous: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const username = String(formData.get("username") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const startIso = String(formData.get("start") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const rawZone = String(formData.get("timeZone") ?? "");
  const timeZone = isValidZone(rawZone) ? rawZone : "UTC";

  if (!name) return { error: "Please tell us your name." };
  if (!EMAIL.test(email)) return { error: "That email address doesn't look right." };

  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return { error: "That time is no longer valid." };

  const eventType = await loadPublicEventType(username, slug);
  if (!eventType) return { error: "This booking page is no longer available." };

  const end = new Date(start.getTime() + eventType.durationMinutes * 60_000);

  // Re-derive availability on the server. The posted start time came from the
  // browser, and a start time the host never offered — stale tab, edited form,
  // or a slot taken thirty seconds ago — must not become a booking.
  const offered = await loadSlots(eventType, {
    start: new Date(start.getTime() - 1),
    end: new Date(end.getTime() + 1),
  });
  if (!offered.some((slot) => slot.start.getTime() === start.getTime())) {
    return { conflict: true, error: "That slot has just been taken. Please choose another time." };
  }

  const uid = randomUUID();
  const db = await getDb();

  try {
    await db.transaction(async (tx) => {
      const [booking] = await tx
        .insert(schema.bookings)
        .values({
          uid,
          eventTypeId: eventType.id,
          hostUserId: eventType.host.id,
          title: `${eventType.title} between ${eventType.host.name ?? username} and ${name}`,
          description: notes || null,
          startsAt: start,
          endsAt: end,
          // Snapshotted, not joined: editing the event type later must not
          // retroactively change what this booking occupies.
          beforeBufferMinutes: eventType.beforeBufferMinutes,
          afterBufferMinutes: eventType.afterBufferMinutes,
          status: eventType.requiresConfirmation ? "pending" : "accepted",
          attendeeTimeZone: timeZone,
        })
        .returning({ id: schema.bookings.id });

      await tx.insert(schema.bookingAttendees).values({
        bookingId: booking!.id,
        name,
        email,
        timeZone,
      });
    });
  } catch (error) {
    // Losing the race is an ordinary outcome on a busy calendar, not a fault.
    // The database refused the overlap, which is exactly its job.
    if (isBookingConflict(error)) {
      return {
        conflict: true,
        error: "Someone just booked that time. Please pick another slot.",
      };
    }
    throw error;
  }

  redirect(`/booking/${uid}`);
}
