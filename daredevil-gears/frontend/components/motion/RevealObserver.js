'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * One IntersectionObserver for the whole site: any element with .reveal / .reveal-pop gets
 * .is-in the first time it scrolls into view. Classes are added straight on the DOM node, so
 * server HTML and React state never disagree. New nodes (route changes, streamed sections,
 * "load more") are picked up by a MutationObserver.
 */
export default function RevealObserver() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains('motion-ok') || !('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal, .reveal-pop').forEach((el) => el.classList.add('is-in'));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    const scan = (node = document) => node.querySelectorAll?.('.reveal:not(.is-in), .reveal-pop:not(.is-in)').forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach((n) => n.nodeType === 1 && (n.matches?.('.reveal, .reveal-pop') ? io.observe(n) : scan(n)));
    });
    mo.observe(document.body, { childList: true, subtree: true });
    // safety net: never leave content invisible (e.g. printed page, odd browsers)
    const t = setTimeout(() => document.querySelectorAll('.reveal:not(.is-in), .reveal-pop:not(.is-in)').forEach((el) => el.getBoundingClientRect().top < innerHeight && el.classList.add('is-in')), 2500);
    return () => {
      io.disconnect();
      mo.disconnect();
      clearTimeout(t);
    };
  }, [pathname]);
  return null;
}
