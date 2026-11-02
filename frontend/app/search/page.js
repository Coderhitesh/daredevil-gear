import { Suspense } from 'react';
import Link from 'next/link';
import Listing from '@/components/listing/Listing';
import { ProductGridSkeleton } from '@/components/product/ProductCard';
import SearchRecorder from '@/components/search/SearchRecorder';
import PageHero from '@/components/layout/PageHero';

export async function generateMetadata({ searchParams }) {
  const sp = await searchParams;
  return { title: sp?.q ? `Search: ${String(sp.q).slice(0, 60)}` : 'Search', robots: { index: false, follow: true } };
}

export const dynamic = 'force-dynamic';

export default async function SearchPage({ searchParams }) {
  const sp = await searchParams;
  const q = String(sp?.q || '')
    .trim()
    .slice(0, 80);
  return (
    <>
      <PageHero compact crumbs={[{ name: 'Search', href: '/search' }]} title={q ? `Results for “${q}”` : 'Search'} />
      <div className="wrap pt-8">
        {q ? (
          <>
            <SearchRecorder q={q} />
            <Suspense key={JSON.stringify(sp)} fallback={<ProductGridSkeleton />}>
              <Listing
                endpoint="/search"
                searchParams={{ ...sp, q }}
                basePath="/search"
                clearHref={`/search?q=${encodeURIComponent(q)}`}
                emptyAction={
                  <>
                    Check the spelling, or{' '}
                    <Link className="link" href="/contact">
                      ask us
                    </Link>{' '}
                    — we may be able to source it.
                  </>
                }
              />
            </Suspense>
          </>
        ) : (
          <p className="text-graphite">Type in the search box above to find products by name, type or SKU.</p>
        )}
      </div>
    </>
  );
}
