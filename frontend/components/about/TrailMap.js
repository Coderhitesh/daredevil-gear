/**
 * Hand-built "trail map" for the About page: an orange route climbs from basecamp (Greater Noida)
 * past waypoints to a summit flag. The route draws itself once on load (CSS .trail-draw), and is
 * static for visitors who prefer reduced motion. Purely decorative; the same facts are in the text.
 */
const WAYPOINTS = [
  { x: 96, y: 404, label: 'Basecamp', sub: 'Greater Noida, UP', anchor: 'start', dx: 14, dy: 34 },
  { x: 236, y: 300, label: 'Packed & checked', sub: 'every order', anchor: 'start', dx: 16, dy: 4 },
  { x: 372, y: 222, label: 'Shipped', sub: 'across India', anchor: 'end', dx: -16, dy: 4 },
  { x: 488, y: 108, label: 'Your next trail', sub: '', anchor: 'end', dx: -18, dy: -10 },
];

const ROUTE = 'M96 404 C 150 380, 190 330, 236 300 S 330 262, 372 222 S 450 150, 488 108';

export default function TrailMap({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 580 470" role="img" aria-label="Illustrated trail from our basecamp in Greater Noida to your next adventure" focusable="false">
      <defs>
        <radialGradient id="tm-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFB35C" stopOpacity=".95" />
          <stop offset=".55" stopColor="#EE5A1F" stopOpacity=".35" />
          <stop offset="1" stopColor="#EE5A1F" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tm-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3431" />
          <stop offset="1" stopColor="#24221f" />
        </linearGradient>
        <clipPath id="tm-frame">
          <rect x="6" y="6" width="568" height="458" rx="28" />
        </clipPath>
      </defs>

      <g clipPath="url(#tm-frame)">
        <rect x="0" y="0" width="580" height="470" fill="#191d1b" />
        {/* contour rings */}
        <g fill="none" stroke="#EE5A1F" strokeOpacity=".14" strokeWidth="1.2">
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <ellipse key={k} cx="470" cy="120" rx={40 + k * 34} ry={26 + k * 22} transform={`rotate(${-12 + k * 2} 470 120)`} />
          ))}
          {[0, 1, 2, 3].map((k) => (
            <ellipse key={`b${k}`} cx="120" cy="420" rx={50 + k * 40} ry={22 + k * 16} />
          ))}
        </g>
        <circle className="sun-drift" cx="430" cy="84" r="92" fill="url(#tm-sun)" />
        {/* far range */}
        <path fill="url(#tm-far)" d="M0 300 L70 250 L130 276 L210 196 L270 232 L340 168 L410 214 L488 92 L540 150 L580 128 V470 H0Z" />
        <path fill="#e9e3d8" opacity=".85" d="M488 92 L503 112 L514 104 L528 124 L540 150 L476 150 L470 118Z" />
        {/* near ridges */}
        <path fill="#232724" d="M0 360 L90 318 L170 352 L260 296 L350 340 L440 290 L580 330 V470 H0Z" />
        <path fill="#121614" d="M0 418 L120 384 L230 420 L340 386 L460 424 L580 396 V470 H0Z" />

        {/* the route */}
        <path d={ROUTE} fill="none" stroke="#000" strokeOpacity=".35" strokeWidth="9" strokeLinecap="round" />
        <path className="trail-draw" d={ROUTE} fill="none" stroke="#EE5A1F" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 9" />

        {/* basecamp tent */}
        <g transform="translate(60 360)">
          <path d="M0 44 L36 0 L72 44Z" fill="#EE5A1F" />
          <path d="M36 0 L36 44 L26 44 L36 18 L46 44 L36 44Z" fill="#121614" opacity=".55" />
          <path d="M-8 44 H80" stroke="#e9e3d8" strokeOpacity=".5" strokeWidth="2" />
        </g>

        {/* summit flag */}
        <g transform="translate(488 108)">
          <path d="M0 0 V-46" stroke="#e9e3d8" strokeWidth="3" strokeLinecap="round" />
          <path className="flag-wave" d="M0 -46 L30 -38 L0 -28Z" fill="#EE5A1F" />
        </g>

        {/* waypoints */}
        {WAYPOINTS.map((w, i) => (
          <g key={w.label} className="waypoint" style={{ '--w': i }}>
            <circle cx={w.x} cy={w.y} r="9" fill="#121614" stroke="#EE5A1F" strokeWidth="3" />
            <circle cx={w.x} cy={w.y} r="3" fill="#FFB35C" />
            <text x={w.x + w.dx} y={w.y + w.dy} textAnchor={w.anchor} fill="#FAF8F5" fontFamily="var(--font-display, Poppins), sans-serif" fontSize="15" fontWeight="600">
              {w.label}
            </text>
            {w.sub ? (
              <text x={w.x + w.dx} y={w.y + w.dy + 18} textAnchor={w.anchor} fill="#b9b3aa" fontFamily="var(--font-body, Inter), sans-serif" fontSize="12.5">
                {w.sub}
              </text>
            ) : null}
          </g>
        ))}

        {/* compass rose */}
        <g transform="translate(70 70)" opacity=".85">
          <circle r="30" fill="none" stroke="#e9e3d8" strokeOpacity=".35" />
          <path d="M0 -24 L6 0 L0 24 L-6 0Z" fill="#e9e3d8" opacity=".25" />
          <path d="M0 -24 L6 0 L-6 0Z" fill="#EE5A1F" />
          <text y="-34" textAnchor="middle" fill="#e9e3d8" fontSize="11" fontFamily="var(--font-display, Poppins), sans-serif" opacity=".7">
            N
          </text>
        </g>
      </g>
      <rect x="6" y="6" width="568" height="458" rx="28" fill="none" stroke="#ffffff" strokeOpacity=".08" />
    </svg>
  );
}
