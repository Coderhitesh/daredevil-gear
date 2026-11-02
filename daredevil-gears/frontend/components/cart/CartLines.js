'use client';

import Link from 'next/link';
import { Trash2, AlertTriangle } from 'lucide-react';
import ProductThumb from '../product/ProductThumb';
import QuantityStepper from '../ui/QuantityStepper';
import { useCartMutation } from '@/lib/hooks';
import { api } from '@/lib/api-client';
import { inr } from '@/lib/format';

export default function CartLines({ cart, compact = false }) {
  const update = useCartMutation(({ id, quantity }) => api(`/cart/items/${id}`, { method: 'PATCH', body: { quantity } }));
  const remove = useCartMutation(({ id }) => api(`/cart/items/${id}`, { method: 'DELETE' }), { onSuccessMessage: 'Removed from cart' });

  return (
    <div>
      {cart.notices?.length ? (
        <ul className="space-y-2 border-b border-stone-300 bg-signal-light/60 px-5 py-3" role="alert">
          {cart.notices.map((n, i) => (
            <li key={i} className="flex gap-2 text-sm text-ink">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-signal-dark" />
              {n.message}
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="divide-y divide-stone-300">
        {cart.items.map((item) => (
          <li key={item.id} className={`flex gap-4 ${compact ? 'p-5' : 'py-6'}`}>
            <Link href={`/product/${item.product.slug}`} className="shrink-0">
              <ProductThumb image={item.product.image} name={item.product.name} size={compact ? 80 : 104} />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/product/${item.product.slug}`} className="line-clamp-2 font-medium text-ink hover:text-signal-dark">
                    {item.product.name}
                  </Link>
                  <p className="mt-0.5 text-[13px] text-graphite-400">
                    {item.variant.title !== 'Default' ? `${item.variant.title}, ` : ''}SKU {item.variant.sku}
                  </p>
                </div>
                <p className="tabular shrink-0 text-right font-medium">{inr(item.lineTotal)}</p>
              </div>
              {!item.inStock ? <p className="mt-1 text-sm font-medium text-alert">Out of stock — remove to continue</p> : <p className="tabular mt-1 text-[13px] text-graphite">{inr(item.unitPrice)} each{item.packagingCharge ? `, plus ${inr(item.packagingCharge)} packaging` : ''}</p>}
              {item.discount ? <p className="tabular text-[13px] text-okay">Coupon −{inr(item.discount)}</p> : null}
              {item.product.minAge >= 18 ? <p className="tag-olive mt-1">Adults only, India delivery</p> : null}
              <div className="mt-3 flex items-center justify-between">
                {item.inStock ? (
                  <QuantityStepper value={item.quantity} max={item.maxQuantity} disabled={update.isPending} onChange={(q) => update.mutate({ id: item.id, quantity: q })} label={`Quantity of ${item.product.name}`} />
                ) : (
                  <span />
                )}
                <button type="button" className="inline-flex items-center gap-1.5 text-sm text-graphite hover:text-alert" onClick={() => remove.mutate({ id: item.id })} disabled={remove.isPending}>
                  <Trash2 size={15} /> Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
