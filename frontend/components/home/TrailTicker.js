/**
 * Slow-moving strip under the hero with the store's own promises (Admin → Homepage → Trust strip).
 * The list is rendered twice for a seamless loop; the copy is hidden from screen readers.
 * Pauses on hover/focus; static for reduced motion.
 */
function Peak() {
  return (
    <svg viewBox="0 0 24 14" className="h-3.5 w-6 shrink-0 text-night/70" aria-hidden="true">
      <path d="M0 14 L7 4 L10 8 L14 1 L24 14Z" fill="currentColor" />
    </svg>
  );
}

export default function TrailTicker({ items = [] }) {
  const words = items.map((t) => t.title).filter(Boolean);
  if (words.length < 2) return null;
  // repeat short lists so one copy is always wider than the screen
  const run = words.length < 6 ? [...words, ...words, ...words] : words;
  const list = (hidden) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {run.map((w, k) => (
        <li key={k} className="flex items-center gap-5 px-5 font-display text-[14px] font-semibold text-night">
          <Peak />
          {w}
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label="Our promises" className="ticker relative overflow-hidden bg-signal py-2.5">
      <div className="ticker-track flex w-max" style={{ '--speed': `${Math.max(28, run.length * 5)}s` }}>
        {list(false)}
        {list(true)}
      </div>
    </section>
  );
}
