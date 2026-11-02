'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Plus, ArrowUp } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';

/**
 * Multi-select of products by id. value: string[] of ids (order preserved).
 */
export default function ProductPicker({ label, hint, value = [], onChange, max = 200 }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const ids = value.map(String);
  const { data: results = [] } = useQuery({
    queryKey: ['product-picker', dq],
    queryFn: () => api('/products', { query: { q: dq, limit: 10 } }).then((r) => r.data),
    enabled: dq.length >= 2,
  });
  const { data: chosen = [] } = useQuery({
    queryKey: ['product-picker-chosen', ids.join(',')],
    queryFn: async () => {
      if (!ids.length) return [];
      const all = await api('/products', { query: { limit: 200 } }).then((r) => r.data);
      const map = new Map(all.map((p) => [String(p._id), p]));
      return ids.map((id) => map.get(id) || { _id: id, name: 'Unknown product', sku: id });
    },
    placeholderData: (p) => p,
  });

  const add = (id) => !ids.includes(String(id)) && ids.length < max && onChange([...ids, String(id)]);
  const remove = (id) => onChange(ids.filter((x) => x !== String(id)));
  const up = (i) => {
    if (i === 0) return;
    const next = [...ids];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange(next);
  };

  return (
    <div className="sm:col-span-2">
      {label ? <p className="label">{label}</p> : null}
      <div className="rounded border border-stone-400">
        <div className="relative border-b border-stone-300 p-2">
          <input className="input" placeholder="Search products by name or SKU to add" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products to add" />
          {dq.length >= 2 && results.length ? (
            <ul className="absolute inset-x-2 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded border border-stone-300 bg-white shadow-lg">
              {results.map((p) => (
                <li key={p._id}>
                  <button type="button" disabled={ids.includes(String(p._id))} onClick={() => (add(p._id), setQ(''))} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-paper disabled:opacity-40">
                    <span className="truncate">{p.name}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-graphite-400">
                      {p.sku} <Plus className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {chosen.length ? (
          <ol className="max-h-72 divide-y divide-stone-200 overflow-y-auto">
            {chosen.map((p, i) => (
              <li key={p._id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="w-5 text-xs text-graphite-400 tabular">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">
                  {p.name} <span className="text-xs text-graphite-400">{p.sku}</span>
                  {p.status && p.status !== 'published' ? <span className="ml-1 text-xs text-caution">({p.status})</span> : null}
                </span>
                <button type="button" className="btn-ghost btn-xs" onClick={() => up(i)} disabled={i === 0} aria-label={`Move ${p.name} up`}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" className="btn-ghost btn-xs" onClick={() => remove(p._id)} aria-label={`Remove ${p.name}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-3 py-3 text-sm text-graphite-400">No products selected.</p>
        )}
      </div>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}
