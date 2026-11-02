'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, ChevronDown, ArrowRight } from 'lucide-react';
import { categoryIcon } from '@/lib/category-icons';

/** "All categories" dropdown (desktop). Keyboard: Enter/Space opens, Escape closes. */
export default function CategoryMenu({ categories = [] }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const onDoc = (e) => !box.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="all-categories"
        onClick={() => setOpen((o) => !o)}
        className="flex h-12 items-center gap-2.5 border-r border-white/[0.07] pr-7 font-display text-[14px] font-semibold text-white hover:text-signal"
      >
        <Menu size={18} aria-hidden="true" />
        All Categories
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div id="all-categories" className="absolute left-0 top-full z-50 mt-1 w-[560px] rounded-2xl border border-stone-300/70 bg-white p-3 text-ink shadow-lift">
          <ul className="grid grid-cols-2 gap-1">
            {categories.map((c) => {
              const { Icon, tint, ink } = categoryIcon(c.slug);
              return (
                <li key={c.id}>
                  <Link href={`/category/${c.slug}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-stone-100">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: tint, color: ink }}>
                      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{c.name}</span>
                      <span className="block text-xs text-graphite-400">{c.productCount} products</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link href="/shop" className="mt-2 flex items-center justify-between rounded-xl bg-night px-4 py-3 font-display text-[14px] font-semibold text-white hover:bg-night-600">
            Shop all products <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
