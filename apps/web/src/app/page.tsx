import Link from "next/link";
import { Credit } from "@/components/credit";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-6">
      <div>
        <p className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-accent">
          Appointment Master
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          Scheduling that gets the time zone right.
        </h1>
        <p className="mt-3 text-ink-muted text-pretty">
          A working slice of the booking flow, running against a real Postgres database with the
          overlap constraint enforced.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/arghya"
          className="group flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-all hover:border-accent hover:shadow-[var(--shadow-pop)]"
        >
          <span>
            <span className="block font-medium tracking-tight">Demo booking page</span>
            <span className="mt-0.5 block text-sm text-ink-muted">
              Three event types, a seeded working week, existing bookings
            </span>
          </span>
          <span
            aria-hidden
            className="text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
          >
            →
          </span>
        </Link>
      </div>

      <Credit className="mt-2" />
    </main>
  );
}
