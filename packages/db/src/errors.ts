/**
 * Translating the overlap guard into something the booking flow can act on.
 *
 * When two people race for the last slot, Postgres rejects the loser with
 * SQLSTATE 23P01 (`exclusion_violation`). That is a *normal*, expected outcome
 * on a busy calendar — not a bug and not a 500. The booking handler catches it,
 * refreshes availability, and tells the attendee the slot just went.
 */

/** `exclusion_violation` — raised by the `bookings_no_overlap` constraint. */
const EXCLUSION_VIOLATION = "23P01";

const OVERLAP_CONSTRAINT = "bookings_no_overlap";

interface PostgresError {
  code?: string;
  constraint_name?: string;
  constraint?: string;
}

/** True when an error is the overlap guard firing, rather than any other failure. */
export function isBookingConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as PostgresError;
  if (e.code !== EXCLUSION_VIOLATION) return false;
  // Narrow to our constraint specifically — a future exclusion constraint on
  // another table must not be silently reported as a slot collision.
  const constraint = e.constraint_name ?? e.constraint;
  return constraint === undefined || constraint === OVERLAP_CONSTRAINT;
}

export class BookingConflictError extends Error {
  override readonly cause?: unknown;

  constructor(cause?: unknown) {
    super("That time was just booked by someone else.");
    this.name = "BookingConflictError";
    this.cause = cause;
  }
}
