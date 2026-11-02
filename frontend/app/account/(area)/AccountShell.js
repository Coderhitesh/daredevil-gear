'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMe } from '@/lib/hooks';
import { api } from '@/lib/api-client';

const NAV = [
  ['/account', 'Overview'],
  ['/account/orders', 'Orders'],
  ['/account/addresses', 'Addresses'],
  ['/account/wishlist', 'Wishlist'],
  ['/account/reviews', 'Reviews'],
  ['/account/profile', 'Profile & notifications'],
  ['/account/security', 'Password & sessions'],
  ['/account/privacy', 'Privacy & data'],
];

export default function AccountShell({ children }) {
  const { data: me, isLoading } = useMe();
  const path = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const publicWishlist = path === '/account/wishlist';

  useEffect(() => {
    if (!isLoading && !me && !publicWishlist) router.replace(`/account/login?next=${encodeURIComponent(path)}`);
  }, [isLoading, me, path, router, publicWishlist]);

  if (isLoading || (!me && !publicWishlist)) {
    return (
      <div className="wrap pt-12">
        <div className="skeleton h-10 w-64" />
        <div className="skeleton mt-8 h-64" />
      </div>
    );
  }

  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    qc.clear();
    router.replace('/');
    router.refresh();
  };

  return (
    <div className="wrap pt-10">
      <h1 className="font-display text-display-lg">{me ? `Hello, ${me.name.split(' ')[0]}` : 'Your wishlist'}</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
        {me ? (
          <nav aria-label="Account" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            <ul className="flex gap-1 lg:flex-col">
              {NAV.map(([href, label]) => {
                const active = href === '/account' ? path === href : path.startsWith(href);
                return (
                  <li key={href}>
                    <Link href={href} aria-current={active ? 'page' : undefined} className={`block whitespace-nowrap rounded px-3 py-2 text-[15px] ${active ? 'bg-graphite text-white' : 'text-graphite hover:bg-stone-200'}`}>
                      {label}
                    </Link>
                  </li>
                );
              })}
              <li>
                <button type="button" onClick={signOut} className="block w-full whitespace-nowrap rounded px-3 py-2 text-left text-[15px] text-graphite hover:bg-stone-200">
                  Sign out
                </button>
              </li>
            </ul>
          </nav>
        ) : (
          <div />
        )}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
