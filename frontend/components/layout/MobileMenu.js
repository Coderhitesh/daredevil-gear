'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Menu, ChevronRight } from 'lucide-react';
import Drawer from '../ui/Drawer';
import { useUi } from '@/lib/store';
import { categoryIcon } from '@/lib/category-icons';

export default function MobileMenu({ categories, links = [] }) {
  const open = useUi((s) => s.menuOpen);
  const setOpen = useUi((s) => s.setMenu);
  const path = usePathname();
  useEffect(() => setOpen(false), [path, setOpen]);
  const close = () => setOpen(false);

  return (
    <>
      <button type="button" className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-night hover:bg-white/10 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
        <Menu size={22} color='black' />
      </button>
      <Drawer open={open} onClose={close} title="Menu" side="left" width="max-w-sm">
        <nav aria-label="Mobile" className="pb-6 text-ink">
          <ul className="grid grid-cols-2 gap-2 p-4">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={`block rounded-xl px-3 py-2.5 text-center font-display text-[14px] font-semibold ${path === l.href ? 'bg-signal text-white' : 'bg-stone-100 text-ink'}`}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="kicker px-5 pb-2 pt-2">Categories</p>
          <ul>
            {categories.map((c) => {
              const { Icon, tint, ink } = categoryIcon(c.slug);
              return (
                <li key={c.id}>
                  <Link href={`/category/${c.slug}`} className="flex items-center gap-3 px-5 py-2.5 text-[15px] hover:bg-stone-100">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: tint, color: ink }}>
                      <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span className="flex-1">{c.name}</span>
                    <ChevronRight size={16} className="text-graphite-400" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 space-y-1 border-t border-stone-300 px-5 pt-5 text-[15px]">
            <Link href="/account" className="block py-1.5 text-graphite">Your account</Link>
            <Link href="/account/orders" className="block py-1.5 text-graphite">Orders</Link>
            <Link href="/track-order" className="block py-1.5 text-graphite">Track an order</Link>
          </div>
        </nav>
      </Drawer>
    </>
  );
}
