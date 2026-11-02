/**
 * Layered ridge-line silhouette (original artwork) used where a landscape photo would sit.
 * Purely decorative. With `animated`, the three ridges rise in one after another and drift
 * with the pointer (depth via the --mx / --my custom properties set by a parent).
 */
const RIDGES = [
  'M0 250 L90 205 L170 232 L260 160 L330 196 L420 128 L505 188 L585 150 L660 210 L760 118 L850 190 L930 150 L1010 200 L1100 104 L1190 176 L1270 140 L1350 196 L1440 156 V400 H0Z',
  'M0 300 L120 248 L230 286 L350 222 L470 280 L590 236 L720 296 L860 226 L990 288 L1120 238 L1260 284 L1440 232 V400 H0Z',
  'M0 352 L170 312 L320 356 L480 318 L650 362 L820 326 L990 364 L1160 322 L1320 354 L1440 336 V400 H0Z',
];
const SNOW = 'M420 128 L438 142 L452 134 L470 150 L505 188 L420 188Z M1100 104 L1120 122 L1136 114 L1150 132 L1190 176 L1100 176Z';

export default function Mountains({ className = '', tone = 'dark', animated = false }) {
  const fills = tone === 'dark' ? ['#2b2927', '#1d211f', '#121614'] : ['#e4dfd6', '#ece8e1', '#faf8f5'];
  if (!animated) {
    return (
      <svg className={`pointer-events-none ${className}`} viewBox="0 0 1440 400" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path fill={fills[0]} d={RIDGES[0]} />
        <path fill={fills[0]} opacity=".55" d={SNOW} />
        <path fill={fills[1]} d={RIDGES[1]} />
        <path fill={fills[2]} d={RIDGES[2]} />
      </svg>
    );
  }
  // far ridges move least; the extra width hides the edges while they drift
  const depth = [6, 14, 26];
  return (
    <svg className={`ridge-rise pointer-events-none overflow-visible ${className}`} viewBox="0 0 1440 400" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {RIDGES.map((d, i) => (
        <g key={i} className="ridge" style={{ '--layer': i, '--depth': depth[i] }}>
          <g>
            <path fill={fills[i]} d={d} transform="translate(-40 0) scale(1.056 1)" />
            {i === 0 ? <path fill={fills[0]} opacity=".55" d={SNOW} transform="translate(-40 0) scale(1.056 1)" /> : null}
            {/* extend each ridge downwards so lifting it never shows a gap */}
            <rect x="-60" y="399" width="1560" height="120" fill={fills[i]} />
          </g>
        </g>
      ))}
    </svg>
  );
}
