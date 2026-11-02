'use client';

import { useEffect, useRef, useState } from 'react';
import { ShoppingCart, Loader2, Check } from 'lucide-react';
import { useAddToCart } from '@/lib/hooks';
import { flyToCart } from '@/lib/fly-to-cart';

/**
 * Quick add from a product card (default option, quantity 1). Server re-checks stock and price.
 * The product photo flies to the header cart and the button briefly confirms "Added".
 */
export default function AddToCartButton({ productId, inStock, name, image }) {
  const { add, isPending } = useAddToCart();
  const [added, setAdded] = useState(false);
  const btn = useRef(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!inStock) {
    return (
      <span className="btn btn-sm w-full cursor-not-allowed bg-stone-200 text-graphite-400" aria-disabled="true">
        Out of stock
      </span>
    );
  }
  return (
    <button
      ref={btn}
      type="button"
      className={`btn-sm w-full shadow-none transition-colors ${added ? 'btn bg-okay text-white hover:bg-okay' : 'btn-primary'}`}
      disabled={isPending}
      aria-label={added ? `${name} added to cart` : `Add ${name} to cart`}
      onClick={(e) => {
        e.preventDefault();
        add({ productId, quantity: 1 }, { openDrawer: false })
          .then(() => {
            flyToCart(btn.current?.closest('article')?.querySelector('img') || btn.current, image);
            setAdded(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setAdded(false), 1800);
          })
          .catch(() => {});
      }}
    >
      {isPending ? (
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      ) : added ? (
        <Check size={16} className="added-in" aria-hidden="true" />
      ) : (
        <ShoppingCart size={16} aria-hidden="true" />
      )}
      <span key={added ? 'a' : 'b'} className={added ? 'added-in' : undefined}>
        {added ? 'Added' : 'Add to Cart'}
      </span>
    </button>
  );
}
