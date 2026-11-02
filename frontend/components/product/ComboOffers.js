'use client';

import { useQuery } from '@tanstack/react-query';
import { BadgePercent } from 'lucide-react';
import { api } from '@/lib/api-client';
import ComboCard from './ComboCard';

/** Offers that include this product: combos ("buy together") and multi-buy ("buy 3+, save 10%"). */
export default function ComboOffers({ slug }) {
  const { data: offers = [] } = useQuery({ queryKey: ['product-offers', slug], queryFn: () => api(`/products/${slug}/offers`), staleTime: 60_000 });
  if (!offers.length) return null;
  const combos = offers.filter((o) => o.type === 'bundle');
  const multi = offers.filter((o) => o.type === 'multi_buy');
  return (
    <section className="wrap mt-12" aria-labelledby="combo-offers">
      <h2 id="combo-offers" className="mb-4 font-display text-display-md">Offers on this product</h2>
      {multi.length ? (
        <ul className="mb-4 space-y-2">
          {multi.map((o) => (
            <li key={o.id} className="flex items-start gap-3 rounded-xl border border-signal/25 bg-signal-light/60 px-4 py-3 text-[14.5px]">
              <BadgePercent size={20} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
              <span>
                <strong className="font-semibold">{o.name}:</strong> buy {o.minQuantity} or more eligible items and get {o.percentOff}% off them
                {o.maxDiscount ? ` (up to ₹${(o.maxDiscount / 100).toLocaleString('en-IN')})` : ''}. Applied automatically in your cart.
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {combos.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {combos.map((o) => (
            <ComboCard key={o.id} offer={o} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
