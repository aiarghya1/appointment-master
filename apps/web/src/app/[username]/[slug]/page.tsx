import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicEventType, loadSlots } from "@/server/booking";
import {
  currentMonth,
  groupByLocalDate,
  isValidMonth,
  isValidZone,
  monthWindow,
} from "@/lib/time";
import { getDictionary, getLocale } from "@/i18n/server";
import { Booker } from "./booker";

interface PageProps {
  params: Promise<{ username: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username, slug } = await params;
  const eventType = await loadPublicEventType(username, slug);
  if (!eventType) return { title: "Not found" };

  const host = eventType.host.name ?? username;
  return {
    title: `${eventType.title} with ${host}`,
    description: eventType.description ?? `Book ${eventType.durationMinutes} minutes with ${host}.`,
  };
}

export default async function BookingPage({ params, searchParams }: PageProps) {
  const { username, slug } = await params;
  const sp = await searchParams;

  const [eventType, dict, locale] = await Promise.all([
    loadPublicEventType(username, slug),
    getDictionary(),
    getLocale(),
  ]);
  if (!eventType) notFound();

  // Until the browser tells us otherwise, render in the host's zone. The client
  // replaces this with the viewer's own zone on mount, which keeps the page
  // server-rendered and shareable rather than blank until JavaScript arrives.
  const rawZone = one(sp.tz);
  const timeZone = isValidZone(rawZone) ? rawZone : eventType.scheduleTimeZone;

  const rawMonth = one(sp.month);
  const month = isValidMonth(rawMonth, timeZone) ? rawMonth : currentMonth(timeZone);

  const slots = await loadSlots(eventType, monthWindow(month, timeZone));
  const byDate = groupByLocalDate(slots, timeZone);

  const requested = one(sp.date);
  const selectedDate =
    requested && byDate.has(requested) ? requested : ([...byDate.keys()].sort()[0] ?? null);

  return (
    <Booker
      username={username}
      slug={slug}
      title={eventType.title}
      description={eventType.description}
      durationMinutes={eventType.durationMinutes}
      requiresConfirmation={eventType.requiresConfirmation}
      hostName={eventType.host.name ?? username}
      hostTimeZone={eventType.scheduleTimeZone}
      timeZone={timeZone}
      month={month}
      selectedDate={selectedDate}
      hour12={one(sp.hour12) !== "false"}
      locale={locale}
      t={dict.booking}
      creditLabels={dict.credit}
      slotsByDate={Object.fromEntries(
        [...byDate].map(([date, list]) => [date, list.map((s) => s.start.toISOString())]),
      )}
    />
  );
}
