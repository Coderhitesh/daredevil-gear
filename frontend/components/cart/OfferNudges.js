import { Sparkles } from 'lucide-react';

/** "Add 1 more to get 10% off" style hints from the server's offer engine. */
export default function OfferNudges({ nudges = [] }) {
  if (!nudges.length) return null;
  return (
    <ul className="space-y-2">
      {nudges.slice(0, 3).map((n) => (
        <li key={n.offerId} className="flex gap-2.5 rounded-xl border border-signal/25 bg-signal-light/60 px-3.5 py-2.5 text-[13.5px] text-ink">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
          <span>{n.message}</span>
        </li>
      ))}
    </ul>
  );
}
