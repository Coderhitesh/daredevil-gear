'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import Drawer from '../ui/Drawer';
import CartLines from './CartLines';
import { useCart } from '@/lib/hooks';
import { useUi } from '@/lib/store';
import { inr } from '@/lib/format';

export default function CartDrawer() {
  const open = useUi((s) => s.cartOpen);
  const close = useUi((s) => s.closeCart);
  const { data: cart, isLoading } = useCart();
  const empty = !isLoading && (!cart || !cart.items.length);

  return (
    <Drawer
      open={open}
      onClose={close}
      title={cart?.count ? `Your cart (${cart.count})` : 'Your cart'}
      footer={
        !empty && cart ? (
          <div className="space-y-3">
            {cart.freeShipping && !cart.freeShipping.qualified ? (
              <p className="text-sm text-graphite">
                Add <strong className="tabular">{inr(cart.freeShipping.remaining)}</strong> more for free delivery.
              </p>
            ) : cart.freeShipping?.qualified ? (
              <p className="text-sm text-okay">Your order qualifies for free delivery.</p>
            ) : null}
            <div className="flex items-baseline justify-between">
              <span className="text-graphite">Items (incl. GST)</span>
              <span className="tabular font-display text-xl font-semibold">{inr(cart.totals.netItems)}</span>
            </div>
            {cart.totals.packagingCharge ? (
              <div className="flex justify-between text-sm text-graphite">
                <span>Packaging</span>
                <span className="tabular">{inr(cart.totals.packagingCharge)}</span>
              </div>
            ) : null}
            <p className="text-[13px] text-graphite-400">Delivery is calculated from your PIN code and shown before payment.</p>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/cart" onClick={close} className="btn-outline">
                View cart
              </Link>
              <Link href="/checkout" onClick={close} className={`btn-primary ${cart.canCheckout ? '' : 'pointer-events-none opacity-50'}`} aria-disabled={!cart.canCheckout}>
                Checkout
              </Link>
            </div>
          </div>
        ) : null
      }
    >
      {isLoading ? (
        <div className="space-y-4 p-5">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="skeleton h-20 w-20" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-4 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : empty ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <ShoppingBag size={36} strokeWidth={1.25} className="text-graphite-400" />
          <p className="font-display text-2xl">Your cart is empty</p>
          <p className="text-graphite">Browse the range and add what you need for your next trip.</p>
          <Link href="/shop" onClick={close} className="btn-dark">
            Shop the range
          </Link>
        </div>
      ) : (
        <CartLines cart={cart} compact />
      )}
    </Drawer>
  );
}
