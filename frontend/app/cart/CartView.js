'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { useCart } from '@/lib/hooks';
import CartLines from '@/components/cart/CartLines';
import OrderSummary from '@/components/cart/OrderSummary';
import CouponForm from '@/components/cart/CouponForm';
import OfferNudges from '@/components/cart/OfferNudges';
import RecentlyViewed from '@/components/home/RecentlyViewed';
import { inr } from '@/lib/format';

export default function CartView() {
  const [dest, setDest] = useState(null);
  const [pin, setPin] = useState('');
  const { data: cart, isLoading, isFetching } = useCart(dest);

  if (isLoading) {
    return (
      <div className="wrap grid gap-10 pt-10 lg:grid-cols-[1fr_380px]">
        <div className="skeleton h-80" />
        <div className="skeleton h-64" />
      </div>
    );
  }

  if (!cart?.items?.length) {
    return (
      <div className="wrap pt-16">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center">
          <ShoppingBag size={40} strokeWidth={1.25} className="text-graphite-400" />
          <h1 className="font-display text-display-md">Your cart is empty</h1>
          <p className="text-graphite">Find what you need for your next trip, then come back here to check out.</p>
          <Link href="/shop" className="btn-dark">
            Shop the range
          </Link>
        </div>
        <RecentlyViewed />
      </div>
    );
  }

  return (
    <div className="wrap pt-10">
      <h1 className="font-display text-display-lg">Your cart</h1>
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
        <div className="border-t border-stone-300">
          <CartLines cart={cart} />
        </div>
        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className="panel space-y-5 p-5">
            <h2 className="font-display text-2xl">Order summary</h2>
            {cart.freeShipping && !cart.freeShipping.qualified ? (
              <div>
                <p className="text-sm text-graphite">
                  Add <strong className="tabular">{inr(cart.freeShipping.remaining)}</strong> more for free delivery.
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded bg-stone-300" aria-hidden="true">
                  <div className="h-full bg-signal" style={{ width: `${Math.min(100, ((cart.freeShipping.threshold - cart.freeShipping.remaining) / cart.freeShipping.threshold) * 100)}%` }} />
                </div>
              </div>
            ) : null}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (/^[1-9]\d{5}$/.test(pin)) setDest({ pincode: pin });
              }}
            >
              <label htmlFor="cart-pin" className="field-label">
                Estimate delivery for your PIN code
              </label>
              <div className="flex gap-2">
                <input id="cart-pin" inputMode="numeric" maxLength={6} className="input h-10" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="6-digit PIN" />
                <button type="submit" className="btn-outline btn-sm h-10" disabled={pin.length !== 6}>
                  Estimate
                </button>
              </div>
              {cart.shippingError ? <p className="field-error">{cart.shippingError.message}</p> : null}
            </form>
            <OfferNudges nudges={cart.offerNudges} />
            <CouponForm coupon={cart.coupon} />
            <div className={isFetching ? 'opacity-60 transition-opacity' : ''} aria-busy={isFetching}>
              <OrderSummary totals={cart.totals} shippingLabel={cart.shipping?.selected?.name} />
            </div>
            <Link href="/checkout" className={`btn-primary w-full ${cart.canCheckout ? '' : 'pointer-events-none opacity-50'}`} aria-disabled={!cart.canCheckout}>
              Continue to checkout
            </Link>
            {!cart.canCheckout ? <p className="text-sm text-alert">Remove unavailable items to continue.</p> : null}
            <p className="text-[13px] text-graphite-400">All prices include GST. You will see the final total, including delivery, before you pay.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
