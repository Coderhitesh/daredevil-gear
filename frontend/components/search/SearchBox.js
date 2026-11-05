'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, X, Clock } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useLocalSafe } from '@/lib/store';
import { inr } from '@/lib/format';
import ProductThumb from '../product/ProductThumb';

/** Combobox with live suggestions from the API, recent searches and keyboard navigation. */
export default function SearchBox({ compact = false, variant = 'light' }) {
  const pill = variant === 'dark';
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const { recentSearches, searched, clearSearches } = useLocalSafe();
  const box = useRef(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setData(null);
      return undefined;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api(`/search/suggest?q=${encodeURIComponent(term)}`)
        .then((d) => !ctrl.signal.aborted && setData(d))
        .catch(() => {})
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 180);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    const onDoc = (e) => !box.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const options = data ? [...data.products.map((p) => ({ type: 'product', href: `/product/${p.slug}`, p })), ...data.categories.map((c) => ({ type: 'category', href: `/category/${c.slug}`, c }))] : recentSearches.map((r) => ({ type: 'recent', href: `/search?q=${encodeURIComponent(r)}`, r }));

  const go = (term) => {
    const t = term.trim();
    if (!t) return;
    searched(t);
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(t)}`);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === 'Enter') {
      if (active >= 0 && options[active]) {
        e.preventDefault();
        setOpen(false);
        if (options[active].type === 'recent') go(options[active].r);
        else router.push(options[active].href);
      }
    } else if (e.key === 'Escape') setOpen(false);
  };

  const showPanel = open && (options.length > 0 || (data && q.trim().length >= 2));

  return (
    <div ref={box} className="relative w-full max-w-2xl text-ink">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          Search products
        </label>
        <div className="relative">
          {pill ? null : <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-graphite-400" />}
          <input
            id={`${id}-q`}
            type="search"
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={`${id}-list`}
            aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={compact ? 'Search gear' : 'Search for backpacks, tents, torches, goggles…'}
            className={`input [&::-webkit-search-cancel-button]:hidden text-black ${pill ? 'h-11 rounded-full bg-white pl-5 pr-24 text-[14px] focus:ring-signal/40' : 'h-10 pl-10 pr-9'}`}
          />
          {q ? (
            <button type="button" onClick={() => setQ('')} className={`absolute top-1/2 -translate-y-1/2 rounded p-1 text-graphite-400 hover:text-ink ${pill ? 'right-14' : 'right-2'}`} aria-label="Clear search">
              <X size={16} />
            </button>
          ) : null}
          {pill ? (
            <button type="submit" className="absolute right-1 top-1/2 inline-flex h-9 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-signal text-white transition-colors hover:bg-signal-dark" aria-label="Search">
              <Search size={17} strokeWidth={2.25} />
            </button>
          ) : null}
        </div>
      </form>

      {showPanel ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-stone-300/70 bg-white shadow-lift">
          <ul id={`${id}-list`} role="listbox" aria-label="Suggestions" className="max-h-[70vh] overflow-y-auto py-1">
            {!data && recentSearches.length ? (
              <li className="flex items-center justify-between px-4 pb-1 pt-2 text-xs text-graphite-400">
                Recent searches
                <button type="button" className="hover:text-ink" onClick={clearSearches}>
                  Clear
                </button>
              </li>
            ) : null}
            {data?.correctedQuery ? <li className="px-4 py-2 text-sm text-graphite">Showing results for “{data.correctedQuery}”</li> : null}
            {options.map((o, i) => (
              <li key={o.href} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}>
                {o.type === 'recent' ? (
                  <button type="button" onClick={() => go(o.r)} className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${i === active ? 'bg-stone-200' : 'hover:bg-stone-200'}`}>
                    <Clock size={14} className="text-graphite-400" /> {o.r}
                  </button>
                ) : (
                  <Link href={o.href} onClick={() => (searched(q), setOpen(false))} className={`flex items-center gap-3 px-4 py-2 ${i === active ? 'bg-stone-200' : 'hover:bg-stone-200'}`}>
                    {o.type === 'product' ? (
                      <>
                        <ProductThumb image={o.p.image} name={o.p.name} size={44} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">{o.p.name}</span>
                          <span className="block text-xs text-graphite-400">{o.p.category?.name}</span>
                        </span>
                        <span className="tabular text-sm font-medium">{inr(o.p.price)}</span>
                      </>
                    ) : (
                      <span className="text-sm">
                        In <strong>{o.c.name}</strong> <span className="text-graphite-400">({o.c.productCount})</span>
                      </span>
                    )}
                  </Link>
                )}
              </li>
            ))}
            {data && !data.products.length && !data.categories.length && !loading ? (
              <li className="px-4 py-4 text-sm text-graphite">
                Nothing matches “{q}”. Try a broader word like <button type="button" className="link" onClick={() => setQ('bag')}>bag</button>, <button type="button" className="link" onClick={() => setQ('torch')}>torch</button> or <button type="button" className="link" onClick={() => setQ('goggles')}>goggles</button>.
              </li>
            ) : null}
            {data?.products.length ? (
              <li className="border-t border-stone-200">
                <button type="button" onClick={() => go(q)} className="w-full px-4 py-2.5 text-left text-sm font-medium text-signal-dark hover:bg-stone-200">
                  See all results for “{q.trim()}”
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
