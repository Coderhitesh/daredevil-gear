'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { inr } from '@/lib/format';

/**
 * Products in a combo with their quantities. value: [{ product: id, name, sku, price, quantity }]
 * (name/sku/price are for display only and are stripped before saving).
 */
export default function BundleItemsEditor({ value = [], onChange, error }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const { data: results = [] } = useQuery({
    queryKey: ['bundle-picker', dq],
    queryFn: () => api('/products', { query: { q: dq, limit: 8 } }).then((r) => r.data),
    enabled: dq.length >= 2,
  });
  const items = value || [];
  const has = (id) => items.some((i) => String(i.product) === String(id));
  const add = (p) => !has(p._id) && onChange([...items, { product: String(p._id), name: p.name, sku: p.sku, price: p.pricing?.priceInclusive ?? null, quantity: 1 }]);
  const setQty = (k, n) => onChange(items.map((it, i) => (i === k ? { ...it, quantity: Math.max(1, Math.min(20, Number(n) || 1)) } : it)));
  const remove = (k) => onChange(items.filter((_, i) => i !== k));
  const total = items.every((i) => i.price != null) ? items.reduce((s, i) => s + i.price * i.quantity, 0) : null;

  return (
    <fieldset className="space-y-3">
      <legend className="field-label">Products in the combo</legend>
      {items.length ? (
        <ul className="divide-y divide-stone-200 rounded border border-stone-300">
          {items.map((it, k) => (
            <li key={String(it.product)} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{it.name || 'Product'}</span>
                <span className="text-xs text-graphite-400">
                  {it.sku}
                  {it.price != null ? ` · ${inr(it.price)} each` : ''}
                </span>
              </span>
              <label className="flex items-center gap-1.5 text-xs text-graphite-600">
                Qty
                <input type="number" min={1} max={20} className="input w-16 text-right" value={it.quantity} onChange={(e) => setQty(k, e.target.value)} aria-label={`Quantity of ${it.name}`} />
              </label>
              <button type="button" className="btn-ghost btn-xs" onClick={() => remove(k)} aria-label={`Remove ${it.name}`}>
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-graphite-600">Search below and add at least two units (two products, or one product with quantity 2).</p>
      )}
      {total != null && items.length ? (
        <p className="text-sm text-graphite-600">
          Bought separately today: <strong className="tabular-nums">{inr(total)}</strong>. The combo price must be lower than this.
        </p>
      ) : null}
      <div>
        <input className="input" placeholder="Search products by name or SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
        {results.length && dq.length >= 2 ? (
          <ul className="mt-1 max-h-56 overflow-y-auto rounded border border-stone-300 bg-white text-sm shadow-sm">
            {results.map((p) => (
              <li key={p._id}>
                <button type="button" disabled={has(p._id)} onClick={() => (add(p), setQ(''))} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-stone-100 disabled:opacity-40">
                  <span className="truncate">
                    {p.name} <span className="text-xs text-graphite-400">{p.sku}</span>
                  </span>
                  <Plus className="h-4 w-4 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </fieldset>
  );
}
