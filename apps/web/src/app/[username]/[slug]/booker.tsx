"use client";

import { DateTime } from "luxon";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ISO_DATE, describeZone, formatLongDate, monthGrid, shiftMonth } from "@/lib/time";
import { createBooking, type BookingFormState } from "./actions";

interface BookerProps {
  username: string;
  slug: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  requiresConfirmation: boolean;
  hostName: string;
  hostTimeZone: string;
  timeZone: string;
  month: string;
  selectedDate: string | null;
  hour12: boolean;
  /** ISO instants, bucketed by the local date they fall on in `timeZone`. */
  slotsByDate: Record<string, string[]>;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Booker(props: BookerProps) {
  const { timeZone, month, selectedDate, slotsByDate, hour12 } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [chosenSlot, setChosenSlot] = useState<string | null>(null);

  /** Rewrites the query string without losing unrelated parameters. */
  const navigate = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    startTransition(() => router.push(`${pathname}?${next}`, { scroll: false }));
  };

  // Adopt the viewer's own zone on first load. Without this the page would show
  // the host's working hours in the host's zone, which is the single most
  // confusing thing a booking page can do.
  const adopted = useRef(false);
  useEffect(() => {
    if (adopted.current || searchParams.has("tz")) return;
    adopted.current = true;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && detected !== timeZone) navigate({ tz: detected });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const days = useMemo(() => monthGrid(month, timeZone), [month, timeZone]);
  const today = DateTime.now().setZone(timeZone).toFormat(ISO_DATE);
  const monthLabel = DateTime.fromFormat(month, "yyyy-MM", { zone: timeZone }).toFormat("LLLL yyyy");
  const slots = selectedDate ? (slotsByDate[selectedDate] ?? []) : [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl items-center justify-center p-4 sm:p-8">
      <div className="grid w-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)] lg:grid-cols-[20rem_1fr]">
        <EventSummary {...props} onTimeZoneChange={(tz) => navigate({ tz })} />

        <div className="grid gap-0 sm:grid-cols-[1fr_15rem]">
          <section
            aria-label="Choose a date"
            className={`border-line p-6 sm:border-r ${isPending ? "opacity-60" : ""} transition-opacity`}
          >
            <header className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight">{monthLabel}</h2>
              <div className="flex gap-1">
                <IconButton
                  label="Previous month"
                  onClick={() => navigate({ month: shiftMonth(month, -1, timeZone), date: null })}
                >
                  ‹
                </IconButton>
                <IconButton
                  label="Next month"
                  onClick={() => navigate({ month: shiftMonth(month, 1, timeZone), date: null })}
                >
                  ›
                </IconButton>
              </div>
            </header>

            <div className="grid grid-cols-7 gap-1" role="grid">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="pb-2 text-center text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint"
                >
                  {label.slice(0, 2)}
                </div>
              ))}

              {days.map((day) => {
                const key = day.toFormat(ISO_DATE);
                const inMonth = day.toFormat("yyyy-MM") === month;
                const available = (slotsByDate[key]?.length ?? 0) > 0;
                const isSelected = key === selectedDate;

                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!available}
                    aria-current={key === today ? "date" : undefined}
                    aria-label={`${formatLongDate(key, timeZone)}${
                      available ? `, ${slotsByDate[key]!.length} slots` : ", unavailable"
                    }`}
                    onClick={() => {
                      setChosenSlot(null);
                      navigate({ date: key });
                    }}
                    className={[
                      "relative aspect-square rounded-lg text-sm font-medium transition-colors",
                      !inMonth && "opacity-30",
                      isSelected
                        ? "bg-accent text-white"
                        : available
                          ? "bg-accent-soft text-accent hover:bg-accent hover:text-white"
                          : "text-ink-faint",
                      available ? "cursor-pointer" : "cursor-default",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {day.day}
                    {key === today && (
                      <span
                        aria-hidden
                        className={`absolute inset-x-0 bottom-1 mx-auto h-1 w-1 rounded-full ${
                          isSelected ? "bg-white" : "bg-accent"
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-label="Choose a time" className="flex max-h-[32rem] flex-col p-6 sm:pl-5">
            {selectedDate ? (
              <>
                <header className="mb-4 flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold tracking-tight">
                    {DateTime.fromFormat(selectedDate, ISO_DATE, { zone: timeZone }).toFormat(
                      "ccc d LLL",
                    )}
                  </h2>
                  <button
                    type="button"
                    onClick={() => navigate({ hour12: hour12 ? "false" : "true" })}
                    className="rounded-md border border-line px-2 py-0.5 text-[0.6875rem] font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                  >
                    {hour12 ? "12h" : "24h"}
                  </button>
                </header>

                <div className="-mr-2 flex flex-col gap-2 overflow-y-auto pr-2">
                  {slots.map((iso) => (
                    <SlotButton
                      key={iso}
                      iso={iso}
                      timeZone={timeZone}
                      hour12={hour12}
                      selected={chosenSlot === iso}
                      onSelect={() => setChosenSlot(iso)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="my-auto text-center text-sm text-ink-muted">
                Nothing available this month.
              </p>
            )}
          </section>
        </div>
      </div>

      {chosenSlot && (
        <BookingDialog
          {...props}
          slot={chosenSlot}
          onDismiss={() => setChosenSlot(null)}
          onConflict={() => {
            setChosenSlot(null);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function EventSummary({
  title,
  description,
  durationMinutes,
  hostName,
  timeZone,
  onTimeZoneChange,
}: BookerProps & { onTimeZoneChange: (zone: string) => void }) {
  return (
    <aside className="flex flex-col gap-5 border-line bg-surface-sunken p-6 lg:border-r">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-sm font-semibold text-white">
          {hostName.slice(0, 1).toUpperCase()}
        </span>
        <span className="text-sm font-medium text-ink-muted">{hostName}</span>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && (
          <p className="mt-2 text-sm leading-relaxed text-ink-muted text-pretty">{description}</p>
        )}
      </div>

      <dl className="flex flex-col gap-2 text-sm text-ink-muted">
        <div className="flex items-center gap-2">
          <span aria-hidden>◷</span>
          <dt className="sr-only">Duration</dt>
          <dd>{durationMinutes} minutes</dd>
        </div>
      </dl>

      <div className="mt-auto">
        <label
          htmlFor="timezone"
          className="mb-1.5 block text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint"
        >
          Time zone
        </label>
        <TimeZoneSelect value={timeZone} onChange={onTimeZoneChange} />
      </div>
    </aside>
  );
}

function TimeZoneSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (zone: string) => void;
}) {
  // The full zone list is built only after mount. `Intl.supportedValuesOf`
  // reads the host's ICU data, and Node's list does not match the browser's —
  // rendering it during SSR would guarantee a hydration mismatch. Until then
  // the control holds just the selected zone, which is what it displays anyway.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const zones = useMemo(() => {
    if (!mounted) return [value];
    const all =
      typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return all.includes(value) ? all : [value, ...all];
  }, [mounted, value]);

  return (
    <select
      id="timezone"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition-colors hover:border-line-strong"
    >
      {zones.map((zone) => (
        <option key={zone} value={zone}>
          {describeZone(zone)}
        </option>
      ))}
    </select>
  );
}

function SlotButton({
  iso,
  timeZone,
  hour12,
  selected,
  onSelect,
}: {
  iso: string;
  timeZone: string;
  hour12: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = DateTime.fromISO(iso, { zone: timeZone }).toFormat(hour12 ? "h:mm a" : "HH:mm");
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "tabular w-full rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
        selected
          ? "border-accent bg-accent text-white"
          : "border-line text-ink hover:border-accent hover:text-accent",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function BookingDialog({
  username,
  slug,
  title,
  hostName,
  durationMinutes,
  requiresConfirmation,
  timeZone,
  hour12,
  slot,
  onDismiss,
  onConflict,
}: BookerProps & { slot: string; onDismiss: () => void; onConflict: () => void }) {
  const [state, formAction, pending] = useActionState<BookingFormState, FormData>(createBooking, {});
  const start = DateTime.fromISO(slot, { zone: timeZone });

  useEffect(() => {
    if (state.conflict) onConflict();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.conflict]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-heading"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onDismiss()}
    >
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-pop)]">
        <h2 id="booking-heading" className="text-lg font-semibold tracking-tight">
          Confirm your booking
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {title} with {hostName} — {durationMinutes} minutes
        </p>
        <p className="tabular mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
          {start.toFormat(hour12 ? "cccc d LLLL, h:mm a" : "cccc d LLLL, HH:mm")}
        </p>

        <form action={formAction} className="mt-5 flex flex-col gap-3">
          <input type="hidden" name="username" value={username} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="start" value={slot} />
          <input type="hidden" name="timeZone" value={timeZone} />

          <Field label="Your name" name="name" autoComplete="name" required />
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <Field label="Anything we should know?" name="notes" multiline />

          {state.error && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {pending ? "Booking…" : requiresConfirmation ? "Request booking" : "Confirm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  multiline,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  multiline?: boolean;
}) {
  const shared =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent";
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
        {label}
        {required && <span aria-hidden> *</span>}
      </span>
      {multiline ? (
        <textarea name={name} rows={3} className={`${shared} resize-none`} />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          autoComplete={autoComplete}
          className={shared}
        />
      )}
    </label>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      {children}
    </button>
  );
}
