'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, X } from 'lucide-react';
import Drawer from '../ui/Drawer';
import { inr, plural } from '@/lib/format';
import { priceOffer, priceOfferLabel } from '@/lib/price-offer';

const SORTS = [
  ['featured', 'Featured'],
  ['newest', 'Newest'],
  ['popular', 'Most popular'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating', 'Top rated'],
];

function useQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (changes) => {
    const qs = new URLSearchParams(params.toString());
    if ('minPrice' in changes || 'maxPrice' in changes) {
      qs.delete('under');
      qs.delete('price');
    }
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === undefined || v === '' || v === false) qs.delete(k);
      else qs.set(k, String(v));
    }
    qs.delete('page');
    const s = qs.toString();
    start(() => router.replace(`${pathname}${s ? `?${s}` : ''}`, { scroll: false }));
  };
  return { params, set, pending };
}

function Filters({ facets, params, set }) {
  const offer = priceOffer(params);
  const minP = params.get('minPrice') ?? (offer?.minPrice != null ? String(offer.minPrice) : null);
  const maxP = params.get('maxPrice') ?? (offer?.maxPrice != null ? String(offer.maxPrice) : null);
  const min = minP ? Number(minP) / 100 : '';
  const max = maxP ? Number(maxP) / 100 : '';
  const [lo, setLo] = useState(min);
  const [hi, setHi] = useState(max);
  useEffect(() => {
    setLo(min);
    setHi(max);
  }, [min, max]);
  const brands = (params.get('brand') || '').split(',').filter(Boolean);

  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="mb-3 font-medium">Availability</legend>
        <label className="flex items-center gap-2.5 text-[15px]">
          <input type="checkbox" className="h-4 w-4 accent-signal" checked={params.get('inStock') === 'true'} onChange={(e) => set({ inStock: e.target.checked ? 'true' : null })} />
          In stock only
          {facets?.availability ? <span className="tabular text-graphite-400">({facets.availability.inStock})</span> : null}
        </label>
      </fieldset>

      <fieldset>
        <legend className="mb-3 font-medium">Price (₹, incl. GST)</legend>
        {facets?.price ? (
          <p className="mb-2 text-sm text-graphite-400">
            {inr(facets.price.min)} to {inr(facets.price.max)}
          </p>
        ) : null}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            set({ minPrice: lo !== '' ? Math.round(Number(lo) * 100) : null, maxPrice: hi !== '' ? Math.round(Number(hi) * 100) : null });
          }}
        >
          <label className="sr-only" htmlFor="minp">Minimum price</label>
          <input id="minp" inputMode="numeric" className="input h-10 min-w-0 flex-1" placeholder="Min" value={lo} onChange={(e) => setLo(e.target.value.replace(/[^\d]/g, ''))} />
          <span className="text-graphite-400">to</span>
          <label className="sr-only" htmlFor="maxp">Maximum price</label>
          <input id="maxp" inputMode="numeric" className="input h-10 min-w-0 flex-1" placeholder="Max" value={hi} onChange={(e) => setHi(e.target.value.replace(/[^\d]/g, ''))} />
          <button type="submit" className="btn-outline btn-sm h-10">
            Apply
          </button>
        </form>
      </fieldset>

      {facets?.brands?.length ? (
        <fieldset>
          <legend className="mb-3 font-medium">Brand</legend>
          <div className="space-y-2">
            {facets.brands.map((b) => (
              <label key={b.slug} className="flex items-center gap-2.5 text-[15px]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-signal"
                  checked={brands.includes(b.slug)}
                  onChange={(e) => set({ brand: (e.target.checked ? [...brands, b.slug] : brands.filter((x) => x !== b.slug)).join(',') || null })}
                />
                {b.name} <span className="tabular text-graphite-400">({b.count})</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

export default function ListingControls({ facets, total }) {
  const { params, set, pending } = useQueryState();
  const [open, setOpen] = useState(false);
  const offer = params.get('minPrice') || params.get('maxPrice') ? null : priceOffer(params);
  const active = [
    params.get('inStock') === 'true' && { key: 'inStock', label: 'In stock' },
    offer && { key: 'price', label: priceOfferLabel(offer) },
    (params.get('minPrice') || params.get('maxPrice')) && { key: 'price', label: `${params.get('minPrice') ? inr(+params.get('minPrice')) : '₹0'} to ${params.get('maxPrice') ? inr(+params.get('maxPrice')) : 'any'}` },
    ...(params.get('brand') || '').split(',').filter(Boolean).map((b) => ({ key: `brand:${b}`, label: b.replace(/-/g, ' ') })),
  ].filter(Boolean);

  const clear = (key) => {
    if (key === 'price') set({ minPrice: null, maxPrice: null });
    else if (key.startsWith('brand:')) set({ brand: (params.get('brand') || '').split(',').filter((b) => b !== key.slice(6)).join(',') || null });
    else set({ [key]: null });
  };

  return (
    <div className="mb-8">
      <div className="rounded-2xl border border-stone-300/70 bg-white px-3 py-3 shadow-card sm:px-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setOpen(true)} className="btn-outline btn-sm shrink-0">
            <SlidersHorizontal size={16} /> Filter{active.length ? ` (${active.length})` : ''}
          </button>
          <p className="tabular hidden text-sm text-graphite sm:block" aria-live="polite">
            {pending ? 'Updating…' : plural(total, 'product')}
          </p>
          <label className="ml-auto flex min-w-0 flex-1 items-center gap-2 text-sm sm:flex-none">
            <span className="hidden text-graphite sm:inline">Sort by</span>
            <select className="input h-10 w-full py-1 pr-8 text-sm sm:h-9 sm:w-auto" aria-label="Sort by" value={params.get('sort') || 'featured'} onChange={(e) => set({ sort: e.target.value === 'featured' ? null : e.target.value })}>
              {SORTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="tabular mt-2 text-[13px] text-graphite sm:hidden">{pending ? 'Updating…' : plural(total, 'product')}</p>
      </div>
      {active.length ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Active filters">
          {active.map((a) => (
            <li key={a.key}>
              <button type="button" onClick={() => clear(a.key)} className="inline-flex items-center gap-1.5 rounded-full border border-signal/40 bg-signal-50 px-3 py-1 text-sm capitalize text-signal-dark hover:border-signal" aria-label={`Remove filter ${a.label}`}>
                {a.label} <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Drawer open={open} onClose={() => setOpen(false)} title="Filter products" side="left" width="max-w-sm" footer={<button type="button" className="btn-dark w-full" onClick={() => setOpen(false)}>Show {plural(total, 'product')}</button>}>
        <div className="p-5">
          <Filters facets={facets} params={params} set={set} />
        </div>
      </Drawer>
    </div>
  );
}
