'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { useWishlist } from '@/lib/hooks';
import { useUi } from '@/lib/store';

export default function WishlistButton({ productId, name, className = '', withLabel = false }) {
  const { has, toggle } = useWishlist();
  const notify = useUi((s) => s.notify);
  const active = has(productId);
  const [burst, setBurst] = useState(0); // bumps on every save, replays the pop

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          if (!active) setBurst((b) => b + 1);
          await toggle(productId);
          notify(active ? 'Removed from your wishlist' : 'Saved to your wishlist', 'good');
        } catch (err) {
          notify(err.message, 'bad');
        }
      }}
      className={`inline-flex items-center justify-center gap-2 ${className}`}
    >
      <span className="relative inline-flex">
        {burst ? <span key={`r${burst}`} className="heart-ring pointer-events-none absolute inset-[-6px] rounded-full border-2 border-signal" aria-hidden="true" /> : null}
        <Heart key={`h${burst}`} size={18} strokeWidth={1.75} className={`${active ? 'fill-signal text-signal' : ''} ${burst ? 'heart-pop' : ''}`} />
      </span>
      {withLabel ? <span>{active ? 'Saved' : 'Save'}</span> : null}
    </button>
  );
}
