const LINKEDIN_URL = "https://www.linkedin.com/in/aiarghya1/";

/**
 * Author credit, shown once beneath the main card on every screen.
 *
 * Deliberately quiet: it sits outside the card in the faint ink tone so it
 * reads as page furniture rather than competing with the booking flow. The
 * mark is decorative and hidden from assistive tech — the link text already
 * says who and where it goes.
 */
export function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-xs text-ink-faint ${className}`}>
      Developed by{" "}
      <a
        href={LINKEDIN_URL}
        target="_blank"
        // noreferrer alongside noopener: without it the destination receives
        // this page's URL, and booking links identify the host.
        rel="noopener noreferrer"
        className="ml-0.5 inline-flex items-center gap-1 font-medium text-ink-muted underline-offset-4 transition-colors hover:text-accent hover:underline focus-visible:text-accent"
      >
        Arghya Polley
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-3 w-3 shrink-0 fill-current opacity-70"
        >
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
        </svg>
        <span className="sr-only">(LinkedIn, opens in a new tab)</span>
      </a>
    </p>
  );
}
