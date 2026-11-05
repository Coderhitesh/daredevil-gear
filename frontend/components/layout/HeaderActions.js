'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Heart, ShoppingCart, User, PackageSearch } from 'lucide-react';
import { useCart, useMe, useWishlist } from '@/lib/hooks';
import { useUi } from '@/lib/store';

/** Badge; pops when the number goes up (not on first load). */
function Count({ n }) {
  const prev = useRef(n);
  const [pop, setPop] = useState(0);
  useEffect(() => {
    if (prev.current != null && n > prev.current) setPop((p) => p + 1);
    prev.current = n;
  }, [n]);
  if (!n) return null;
  return (
    <span key={pop} className={`${pop ? 'count-pop ' : ''}tabular absolute -right-1 -top-1 min-w-[1.15rem] rounded-full bg-signal px-1 text-center text-[11px] font-semibold leading-[1.15rem] text-white ring-2 ring-night`}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

export default function HeaderActions() {
  const { data: me } = useMe();
  const { data: cart } = useCart();
  const { ids } = useWishlist();
  const openCart = useUi((s) => s.openCart);
  const item = 'relative inline-flex h-10 items-center justify-center gap-2 rounded-lg px-2.5 text-[13px] text-stone-200 transition-colors hover:bg-white/[0.06] hover:text-white';

  return (
    <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
     <Link href="/track-order" className={`${item} !text-black hidden xl:inline-flex`}>
  <PackageSearch size={18} color="black" strokeWidth={1.75} aria-hidden="true" />
  Track Order
</Link>
      <Link href="/account/wishlist" className={`${item} w-10 px-0 xl:w-auto xl:px-2.5`} aria-label={`Wishlist${ids.length ? `, ${ids.length} items` : ''}`}>
        <span className="relative">
          <Heart size={19} strokeWidth={1.75} color='black' aria-hidden="true" />
          <Count n={ids.length} />
        </span>
        <span className="hidden xl:inline text-night">Wishlist</span>
      </Link>
      <Link href={me ? '/account' : '/account/login'} className={`${item} w-10 text-night px-0 sm:w-auto sm:px-2.5`} aria-label={me ? 'Your account' : 'Sign in'}>
        <User size={19} strokeWidth={1.75} color='black' aria-hidden="true" />
        <span className="hidden text-night sm:inline">{me ? me.name.split(' ')[0] : 'Sign in'}</span>
      </Link>
      <button type="button" data-cart-target onClick={openCart} className="relative ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-signal text-white shadow-glow transition-colors hover:bg-signal-dark" aria-label={`Cart${cart?.count ? `, ${cart.count} items` : ''}`}>
        <ShoppingCart size={18} strokeWidth={2} aria-hidden="true" />
        <Count n={cart?.count} />
      </button>
    </div>
  );
}
