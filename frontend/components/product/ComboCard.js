'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Plus, Loader2, PackagePlus } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useCartMutation } from '@/lib/hooks';
import { useUi } from '@/lib/store';
import { inr } from '@/lib/format';
import { bumpCart } from '@/lib/fly-to-cart';

/**
 * One combo offer: the products, today's price if bought separately, the combo price and the
 * real saving (all from the server). "Add combo" puts every item in the cart.
 */
export default function ComboCard({ offer, compact = false }) {
  const openCart = useUi((s) => s.openCart);
  const m = useCartMutation(() => api(`/cart/offers/${offer.id}`, { method: 'POST' }), { onSuccessMessage: `${offer.name} added — combo price applied` });
  return (
    <article className="flex h-full flex-col rounded-2xl border border-signal/25 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="kicker">Combo offer</p>
          <h3 className="mt-1 font-display text-[17px] font-semibold leading-snug text-ink">{offer.name}</h3>
          {offer.description ? <p className="mt-1 text-[13.5px] text-graphite">{offer.description}</p> : null}
        </div>
        <span className="badge shrink-0 bg-signal text-white">Save {inr(offer.saving)}</span>
      </div>

      <ul className={`mt-4 flex flex-wrap items-center gap-2 ${compact ? '' : 'sm:gap-3'}`}>
        {offer.items.map((it, k) => (
          <li key={it.variantId} className="flex items-center gap-2">
            {k > 0 ? <Plus size={16} className="text-graphite-400" aria-hidden="true" /> : null}
            <Link href={`/product/${it.product.slug}`} className="group flex items-center gap-2.5 rounded-xl border border-stone-300/70 bg-stone-100/60 p-1.5 pr-3 hover:border-signal/50">
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white">
                {it.product.image?.url ? <Image src={it.product.image.url} alt="" fill sizes="48px" className="object-contain p-1" /> : <span className="flex h-full w-full items-center justify-center font-display text-xs font-bold text-graphite-400">{it.product.name.slice(0, 2).toUpperCase()}</span>}
              </span>
              <span className="max-w-[11rem] text-[13px] leading-snug">
                <span className="line-clamp-2 font-medium text-ink group-hover:text-signal-dark">{it.product.name}</span>
                <span className="tabular text-graphite-400">
                  {it.quantity > 1 ? `${it.quantity} × ` : ''}
                  {inr(it.unitPrice)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-4">
        <p>
          <span className="block text-[12.5px] text-graphite-400">
            Bought separately <span className="tabular">{inr(offer.regularPrice)}</span>
          </span>
          <span className="tabular font-display text-2xl font-bold text-ink">{inr(offer.bundlePrice)}</span>
          <span className="ml-1.5 text-[12.5px] text-graphite-400">combo price, GST included</span>
        </p>
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={m.isPending || !offer.inStock}
          onClick={() =>
            m.mutateAsync().then(() => {
              bumpCart();
              openCart();
            }).catch(() => {})
          }
        >
          {m.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <PackagePlus size={16} aria-hidden="true" />}
          {offer.inStock ? 'Add combo to cart' : 'Out of stock'}
        </button>
      </div>
      {!offer.combinableWithCoupons ? <p className="mt-2 text-[12px] text-graphite-400">Coupons do not apply to combo items.</p> : null}
    </article>
  );
}
