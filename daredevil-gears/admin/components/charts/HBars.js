/**
 * Horizontal magnitude bars with direct value labels (single hue; label text stays in ink).
 */
export default function HBars({ rows, format }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.name} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-graphite-600" title={r.name}>
            {r.name}
          </span>
          <span className="h-3 rounded-r bg-stone-200">
            <span className="block h-3 rounded-r bg-olive" style={{ width: `${Math.max(1, (r.value / max) * 100)}%` }} />
          </span>
          <span className="tabular text-ink">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}
