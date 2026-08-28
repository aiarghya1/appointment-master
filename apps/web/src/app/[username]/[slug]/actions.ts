"use server";

import { isBookingConflict, getDb, schema } from "@appointment-master/db";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { loadPublicEventType, loadSlots } from "@/server/booking";
import { isValidZone } from "@/lib/time";
import { getDictionary, getLocale } from "@/i18n/server";
import { sendBookingInvite } from "@/server/notify";

export interface BookingFormState {
  error?: string;
  /** Set when the slot went while the attendee was filling the form. */
  conflict?: boolean;
  /**
   * Echoed back so the form can repopulate itself. A server action re-renders
   * the form on every result, which would otherwise wipe uncontrolled inputs
   * and make the attendee retype their details to recover from an error.
   */
  values?: { name: string; email: string; notes: string };
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

  const values = { name, email, notes };
  // Errors are shown to the attendee, so they follow the page language.
  const dict = await getDictionary();

  if (!name) return { values, error: dict.errors.nameRequired };
  if (!EMAIL.test(email)) return { values, error: dict.errors.emailInvalid };

  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return { values, error: dict.errors.timeInvalid };

  const eventType = await loadPublicEventType(username, slug);
  if (!eventType) return { values, error: dict.errors.pageGone };

  const end = new Date(start.getTime() + eventType.durationMinutes * 60_000);

  // Re-derive availability on the server. The posted start time came from the
  // browser, and a start time the host never offered — stale tab, edited form,
  // or a slot taken thirty seconds ago — must not become a booking.
  //
  // Asking for exactly this slot's window is safe because slot generation is
  // window-independent: narrowing the query filters the results rather than
  // re-anchoring them, so a genuine slot still comes back at exactly `start`.
  const offered = await loadSlots(eventType, { start, end });
  if (!offered.some((slot) => slot.start.getTime() === start.getTime())) {
    return { values, conflict: true, error: dict.errors.slotTaken };
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
        values,
        conflict: true,
        error: dict.errors.raceLost,
      };
    }
    throw error;
  }

  // The meeting is committed at this point. Sending the invitation is a
  // best-effort follow-up: it is awaited because work started after the
  // response is not guaranteed to run on a serverless host, but its failure is
  // logged rather than surfaced, since the booking itself already succeeded
  // and telling the attendee otherwise would be a lie.
  const result = await sendBookingInvite({
    uid,
    title: `${eventType.title} between ${eventType.host.name ?? username} and ${name}`,
    description: notes || null,
    start,
    end,
    timeZone,
    locale: await getLocale(),
    dict,
    pending: eventType.requiresConfirmation,
    host: { name: eventType.host.name, email: eventType.host.email },
    attendee: { name, email },
  });

  if (!result.sent && result.reason === "failed") {
    console.error(`Booking ${uid} saved, but its invitation could not be sent: ${result.detail}`);
  }

  redirect(`/booking/${uid}`);
}
