import { Star } from 'lucide-react';

export default function Stars({ value = 0, size = 16 }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} strokeWidth={1.5} className={i <= Math.round(value) ? 'fill-signal text-signal' : 'text-stone-400'} aria-hidden="true" />
      ))}
    </span>
  );
}
