import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadHostEventTypes } from "@/server/booking";

interface PageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const [first] = await loadHostEventTypes(username);
  return { title: first?.hostName ?? username };
}

export default async function HostPage({ params }: PageProps) {
  const { username } = await params;
  const eventTypes = await loadHostEventTypes(username);
  if (eventTypes.length === 0) notFound();

  const hostName = eventTypes[0]!.hostName ?? username;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 p-6">
      <header className="flex flex-col items-center gap-3 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-accent text-xl font-semibold text-white">
          {hostName.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{hostName}</h1>
          <p className="mt-1 text-sm text-ink-muted">@{username}</p>
        </div>
      </header>

      <ul className="flex flex-col gap-3">
        {eventTypes.map((eventType) => (
          <li key={eventType.slug}>
            <Link
              href={`/${username}/${eventType.slug}`}
              className="group flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-all hover:border-accent hover:shadow-[var(--shadow-pop)]"
            >
              <div className="min-w-0 flex-1">
                <h2 className="font-medium tracking-tight">{eventType.title}</h2>
                {eventType.description && (
                  <p className="mt-1 text-sm text-ink-muted text-pretty">{eventType.description}</p>
                )}
                <p className="mt-2 text-xs font-medium text-ink-faint">
                  {eventType.durationMinutes} minutes
                </p>
              </div>
              <span
                aria-hidden
                className="text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
              >
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
