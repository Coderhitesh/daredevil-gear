'use client';

import { useMemo, useRef, useState } from 'react';

/**
 * Single-series daily bar chart (one hue, no legend — the card title names the series).
 * Bars anchored to the baseline with 4px rounded data-ends, 2px surface gap, recessive grid,
 * per-bar hover/focus tooltip with a hit target wider than the mark, and a table view.
 */
export default function BarTrend({ data, valueKey, format, label, height = 200 }) {
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const wrap = useRef(null);
  const W = 720;
  const H = height;
  const pad = { l: 56, r: 8, t: 10, b: 24 };
  const max = useMemo(() => niceMax(Math.max(1, ...data.map((d) => d[valueKey] || 0))), [data, valueKey]);
  const n = data.length || 1;
  const slot = (W - pad.l - pad.r) / n;
  const barW = Math.max(2, Math.min(28, slot - 2));
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(n / 8);

  if (!data.some((d) => d[valueKey] > 0)) {
    return <p className="flex h-40 items-center justify-center text-graphite-400">No paid orders in this period</p>;
  }

  if (asTable) {
    return (
      <div>
        <Toggle asTable={asTable} setAsTable={setAsTable} />
        <div className="max-h-64 overflow-y-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-right">{label}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td className="text-right tabular">{format(d[valueKey])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrap} className="relative">
      <Toggle asTable={asTable} setAsTable={setAsTable} />
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${label} by day`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#E6E3DC" strokeWidth="1" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#717571" className="tabular">
              {format(t, true)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const v = d[valueKey] || 0;
          const x = pad.l + i * slot + (slot - barW) / 2;
          const top = y(v);
          const h = Math.max(0, y(0) - top);
          const r = Math.min(4, barW / 2, h);
          const on = hover === i;
          return (
            <g key={d.date}>
              {h > 0 ? <path d={roundedTop(x, top, barW, h, r)} fill={on ? '#E94E19' : '#424644'} /> : null}
              <rect
                x={pad.l + i * slot}
                y={pad.t}
                width={slot}
                height={H - pad.t - pad.b}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.date}: ${format(v)}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
              {i % labelEvery === 0 ? (
                <text x={pad.l + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#717571">
                  {shortDate(d.date)}
                </text>
              ) : null}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#BDB8AC" strokeWidth="1" />
      </svg>
      {hover !== null && data[hover] ? (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded border border-stone-300 bg-white px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${((pad.l + hover * slot + slot / 2) / W) * 100}%` }}
        >
          <p className="text-graphite-400">{shortDate(data[hover].date, true)}</p>
          <p className="font-semibold tabular text-ink">{format(data[hover][valueKey])}</p>
          {data[hover].orders !== undefined && valueKey !== 'orders' ? <p className="text-graphite-600">{data[hover].orders} orders</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Toggle({ asTable, setAsTable }) {
  return (
    <div className="mb-1 flex justify-end">
      <button type="button" className="btn-ghost btn-xs text-graphite-400" onClick={() => setAsTable(!asTable)}>
        {asTable ? 'Show chart' : 'Show as table'}
      </button>
    </div>
  );
}

function roundedTop(x, y, w, h, r) {
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

function shortDate(iso, long) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-IN', long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });
}
