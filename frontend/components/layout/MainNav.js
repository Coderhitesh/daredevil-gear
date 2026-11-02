'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MainNav({ links }) {
  const path = usePathname();
  const isOn = (href) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`) || (href === '/shop' && (path.startsWith('/category') || path.startsWith('/collections') || path.startsWith('/product'))));
  return (
    <nav aria-label="Main" className="flex-1">
      <ul className="flex h-12 items-center gap-7 text-[14px] font-medium">
        {links.map((l) => {
          const on = isOn(l.href);
          return (
            <li key={l.href} className="relative h-full">
              <Link href={l.href} aria-current={on ? 'page' : undefined} className={`flex h-full items-center transition-colors ${on ? 'text-signal' : 'text-stone-300 hover:text-white'}`}>
                {l.label}
              </Link>
              {on ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-signal" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
