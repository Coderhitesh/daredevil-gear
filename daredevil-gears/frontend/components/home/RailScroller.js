'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import SectionHead from './SectionHead';

/** Section heading with prev/next arrows that scroll the card row by one viewport. */
export default function RailScroller({ head, children }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }, []);
  useEffect(() => {
    update();
    const el = ref.current;
    el?.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update]);
  const go = (dir) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.9, behavior: 'smooth' });
  const btn = 'flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-white text-ink shadow-card transition-colors hover:border-signal hover:bg-signal hover:text-white disabled:opacity-35 disabled:hover:border-stone-300 disabled:hover:bg-white disabled:hover:text-ink';
  const showArrows = !(edge.start && edge.end);
  return (
    <>
      <SectionHead {...head}>
        {showArrows ? (
          <div className="flex gap-2">
            <button type="button" className={btn} onClick={() => go(-1)} disabled={edge.start} aria-label="Scroll left">
              <ChevronLeft size={18} />
            </button>
            <button type="button" className={btn} onClick={() => go(1)} disabled={edge.end} aria-label="Scroll right">
              <ChevronRight size={18} />
            </button>
          </div>
        ) : null}
      </SectionHead>
      <div ref={ref} className="no-scrollbar -mx-4 overflow-x-auto px-4 pb-4 pt-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {children}
      </div>
    </>
  );
}
