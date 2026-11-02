/**
 * Concentric "contour map" rings drawn as dashed lines that slowly travel (CSS .contour-line).
 * Deterministic shapes (no randomness) so server and client markup match.
 */
function ring(cx, cy, rx, ry, wobble, phase) {
  const pts = [];
  const steps = 48;
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * Math.PI * 2;
    const w = 1 + wobble * Math.sin(3 * t + phase) + wobble * 0.6 * Math.cos(5 * t - phase);
    pts.push(`${(cx + Math.cos(t) * rx * w).toFixed(1)},${(cy + Math.sin(t) * ry * w).toFixed(1)}`);
  }
  return `M${pts.join(' L')}Z`;
}

const HILLS = [
  { cx: 260, cy: 120, n: 7, step: 26, phase: 0.4 },
  { cx: 1180, cy: 70, n: 8, step: 24, phase: 1.7 },
  { cx: 760, cy: 230, n: 5, step: 30, phase: 2.6 },
];

export default function TopoLines({ className = '' }) {
  return (
    <svg className={`pointer-events-none ${className}`} viewBox="0 0 1440 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {HILLS.map((h, i) =>
        Array.from({ length: h.n }, (_, k) => (
          <path
            key={`${i}-${k}`}
            className="contour-line"
            d={ring(h.cx, h.cy, 30 + k * h.step * 1.6, 18 + k * h.step, 0.07 + k * 0.006, h.phase + k * 0.35)}
            fill="none"
            stroke="currentColor"
            strokeWidth={k === h.n - 1 ? 1.4 : 1}
            style={{ animationDuration: `${36 + k * 6}s`, animationDirection: k % 2 ? 'reverse' : 'normal' }}
          />
        ))
      )}
    </svg>
  );
}
