import { Suspense } from 'react';
import { apiGet } from '@/lib/api-server';
import Listing from '@/components/listing/Listing';
import { ProductGridSkeleton } from '@/components/product/ProductCard';
import PageHero from '@/components/layout/PageHero';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const c = await apiGet(`/collections/${slug}`, { revalidate: 300, allow404: true });
  if (!c) return { title: 'Collection not found' };
  return { title: c.seo?.title || c.name, description: c.seo?.description || c.description, alternates: { canonical: `/collections/${c.slug}` } };
}

export default async function CollectionPage({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const c = await apiGet(`/collections/${slug}`, { revalidate: 300 });
  return (
    <>
      <PageHero crumbs={[{ name: c.name, href: `/collections/${c.slug}` }]} kicker="Collection" title={c.name} subtitle={c.description} image={c.image?.url} />
      <div className="wrap pt-8">
        <Suspense key={JSON.stringify(sp)} fallback={<ProductGridSkeleton />}>
          <Listing base={{ collection: c.slug }} searchParams={sp} basePath={`/collections/${c.slug}`} />
        </Suspense>
      </div>
    </>
  );
}
