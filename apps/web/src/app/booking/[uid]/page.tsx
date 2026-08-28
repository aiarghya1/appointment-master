import { getDb, schema } from "@appointment-master/db";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Credit } from "@/components/credit";

export const metadata: Metadata = { title: "Booking confirmed" };

interface PageProps {
  params: Promise<{ uid: string }>;
}

export default async function BookingConfirmationPage({ params }: PageProps) {
  const { uid } = await params;
  const db = await getDb();

  const rows = await db
    .select({
      status: schema.bookings.status,
      title: schema.bookings.title,
      description: schema.bookings.description,
      startsAt: schema.bookings.startsAt,
      endsAt: schema.bookings.endsAt,
      attendeeTimeZone: schema.bookings.attendeeTimeZone,
      hostName: schema.users.name,
      attendeeName: schema.bookingAttendees.name,
      attendeeEmail: schema.bookingAttendees.email,
    })
    .from(schema.bookings)
    .innerJoin(schema.users, eq(schema.bookings.hostUserId, schema.users.id))
    .leftJoin(schema.bookingAttendees, eq(schema.bookingAttendees.bookingId, schema.bookings.id))
    .where(eq(schema.bookings.uid, uid))
    .limit(1);

  const booking = rows[0];
  if (!booking) notFound();

  const zone = booking.attendeeTimeZone;
  const start = DateTime.fromJSDate(booking.startsAt, { zone });
  const end = DateTime.fromJSDate(booking.endsAt, { zone });
  const cancelled = booking.status === "cancelled" || booking.status === "rejected";
  const pending = booking.status === "pending";

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 p-4">
      <div className="w-full rounded-[var(--radius-card)] border border-line bg-surface p-8 shadow-[var(--shadow-card)]">
        <span
          aria-hidden
          className={`grid h-12 w-12 place-items-center rounded-full text-xl ${
            cancelled ? "bg-surface-sunken text-ink-faint" : "bg-accent-soft text-accent"
          }`}
        >
          {cancelled ? "×" : pending ? "◷" : "✓"}
        </span>

        <h1 className="mt-5 text-xl font-semibold tracking-tight">
          {cancelled
            ? "This booking was cancelled"
            : pending
              ? "Awaiting confirmation"
              : "You're booked"}
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          {pending
            ? `${booking.hostName ?? "The host"} will confirm shortly. We'll email ${booking.attendeeEmail} either way.`
            : `A calendar invitation is on its way to ${booking.attendeeEmail}.`}
        </p>

        <dl className="mt-6 flex flex-col gap-3 border-t border-line pt-6 text-sm">
          <Row label="What">{booking.title}</Row>
          <Row label="When">
            <span className="tabular">
              {start.toFormat("cccc, d LLLL yyyy")}
              <br />
              {start.toFormat("h:mm a")} – {end.toFormat("h:mm a")} ({start.toFormat("ZZZZ")})
            </span>
          </Row>
          <Row label="Who">
            {booking.hostName} and {booking.attendeeName}
          </Row>
          {booking.description && <Row label="Notes">{booking.description}</Row>}
        </dl>

        <Link
          href="/"
          className="mt-8 inline-block text-sm font-medium text-accent transition-opacity hover:opacity-70"
        >
          ← Back
        </Link>
      </div>

      <Credit />
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-3">
      <dt className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
