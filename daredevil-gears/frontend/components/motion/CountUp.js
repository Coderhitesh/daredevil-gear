'use client';

import { useEffect, useRef } from 'react';

/**
 * Renders the real number on the server; when it scrolls into view it counts up to the same
 * number (DOM text only, no React state, so hydration always matches). Non-numbers render as is.
 */
export default function CountUp({ value, duration = 1400, className = '' }) {
  const ref = useRef(null);
  const numeric = typeof value === 'number' && Number.isFinite(value);

  useEffect(() => {
    const el = ref.current;
    if (!numeric || !el || !document.documentElement.classList.contains('motion-ok') || !('IntersectionObserver' in window)) return undefined;
    const fmt = (n) => Math.round(n).toLocaleString('en-IN');
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);
          el.textContent = fmt(value * (1 - (1 - t) ** 3)); // ease-out cubic
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        el.textContent = '0';
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [numeric, value, duration]);

  return (
    <span ref={ref} className={className}>
      {numeric ? value.toLocaleString('en-IN') : value}
    </span>
  );
}
