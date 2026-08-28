import Link from "next/link";
import { Credit } from "@/components/credit";
import { getDictionary } from "@/i18n/server";

export default async function HomePage() {
  const dict = await getDictionary();

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-6">
      <div>
        <p className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-accent">
          Appointment Master
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          {dict.home.headline}
        </h1>
        <p className="mt-3 text-ink-muted text-pretty">{dict.home.body}</p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/arghya"
          className="group flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-all hover:border-accent hover:shadow-[var(--shadow-pop)]"
        >
          <span>
            <span className="block font-medium tracking-tight">{dict.home.demoTitle}</span>
            <span className="mt-0.5 block text-sm text-ink-muted">{dict.home.demoBody}</span>
          </span>
          <span
            aria-hidden
            className="text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
          >
            →
          </span>
        </Link>
      </div>

      <Credit labels={dict.credit} className="mt-2" />
    </main>
  );
}
