import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { apiGet } from '@/lib/api-server';
import { ProductGrid } from '../product/ProductCard';
import ListingControls from './ListingControls';
import Pagination from './Pagination';
import { plural } from '@/lib/format';
import { priceOffer } from '@/lib/price-offer';

const ALLOWED = ['sort', 'minPrice', 'maxPrice', 'inStock', 'brand', 'page', 'q'];
// ?under=999 / ?price=999 (rupees) from offer banners; explicit min/max filters win if present

export function listingQuery(searchParams = {}, base = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v) qs.set(k, v);
  for (const k of ALLOWED) {
    const v = searchParams[k];
    if (v !== undefined && v !== '') qs.set(k, String(Array.isArray(v) ? v[0] : v).slice(0, 80));
  }
  const offer = priceOffer(searchParams);
  if (offer && !qs.has('minPrice') && !qs.has('maxPrice')) {
    if (offer.minPrice != null) qs.set('minPrice', String(offer.minPrice));
    if (offer.maxPrice != null) qs.set('maxPrice', String(offer.maxPrice));
  }
  if (!qs.get('limit')) qs.set('limit', '24');
  return qs;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Server-rendered product listing (SEO-friendly). Filters/sort live in the URL;
 * the controls are a small client component that updates the query string.
 */
export default async function Listing({ base = {}, searchParams = {}, basePath, clearHref, endpoint = '/products', emptyAction }) {
  noStore(); // har request pe fresh render, taaki shuffle har baar ho

  const qs = listingQuery(searchParams, base);
  const facetQs = new URLSearchParams(qs);
  facetQs.delete('page');
  const [{ data, meta }, facets] = await Promise.all([
    apiGet(`${endpoint}?${qs}`, { revalidate: endpoint === '/search' ? 0 : 60 }),
    apiGet(`/products/facets?${facetQs}`, { revalidate: 120 }).catch(() => null),
  ]);

  // search me relevance order rakho, baaki listings shuffle
  // (listLast wale products — e.g. Vehicle & Generator Care — shuffle ke baad bhi end me hi rahenge)
  const products =
    endpoint === '/search'
      ? data
      : [...shuffle(data.filter((p) => !p.listLast)), ...shuffle(data.filter((p) => p.listLast))];

  return (
    <div>
      <ListingControls facets={facets} total={meta.total} />
      {meta.correctedQuery ? (
        <p className="mb-6 text-graphite">
          No exact matches for “{meta.query}”. Showing results for <strong>“{meta.correctedQuery}”</strong>.
        </p>
      ) : null}
      {products.length ? (
        <>
          <p className="sr-only" role="status">
            {plural(meta.total, 'product')} found
          </p>
          <ProductGrid products={products} priorityCount={4} />
          <Pagination meta={meta} basePath={basePath} searchParams={searchParams} />
        </>
      ) : (
        <div className="panel flex flex-col items-start gap-4 p-8 sm:p-12">
          <p className="font-display text-2xl">No products match these filters</p>
          <p className="max-w-prose text-graphite">Try removing a filter or widening the price range. {emptyAction}</p>
          <div className="flex flex-wrap gap-3">
            <Link href={clearHref || basePath} className="btn-outline">
              Clear filters
            </Link>
            <Link href="/shop" className="btn-ghost">
              Browse all products
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}