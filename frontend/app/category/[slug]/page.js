import { Suspense } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/api-server';
import Listing from '@/components/listing/Listing';
import PageHero from '@/components/layout/PageHero';
import { ProductGridSkeleton } from '@/components/product/ProductCard';

export async function generateMetadata({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const c = await apiGet(`/categories/${slug}`, { revalidate: 300, allow404: true });
  if (!c) return { title: 'Category not found' };
  const page = Number(sp?.page) > 1 ? Number(sp.page) : null;
  return {
    title: c.seo?.title?.replace(/ \| DareDevil Gears$/, '') || c.name,
    description: c.seo?.description || c.description,
    alternates: { canonical: `/category/${c.slug}${page ? `?page=${page}` : ''}` },
    robots: sp?.sort || sp?.minPrice || sp?.maxPrice || sp?.inStock ? { index: false, follow: true } : undefined,
    openGraph: { title: c.name, description: c.description, images: c.banner?.url || c.image?.url ? [c.banner?.url || c.image?.url] : undefined },
  };
}

export default async function CategoryPage({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const c = await apiGet(`/categories/${slug}`, { revalidate: 300 });
  const crumbs = [...(c.ancestors || []).map((a) => ({ name: a.name, href: `/category/${a.slug}` })), { name: c.name, href: `/category/${c.slug}` }];

  return (
    <>
      <PageHero crumbs={crumbs} kicker={c.productCount ? `${c.productCount} products` : undefined} title={c.name} subtitle={c.description} image={c.banner?.url || c.image?.url}>
        {c.children?.length ? (
          <ul className="mt-6 flex flex-wrap gap-2">
            {c.children.map((ch) => (
              <li key={ch.id}>
                <Link href={`/category/${ch.slug}`} className="inline-block rounded-full border border-white/25 px-4 py-1.5 text-sm text-white hover:border-signal hover:bg-signal">
                  {ch.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </PageHero>
      <div className="wrap pt-8">
        <Suspense key={JSON.stringify(sp)} fallback={<ProductGridSkeleton />}>
          <Listing base={{ category: c.slug }} searchParams={sp} basePath={`/category/${c.slug}`} />
        </Suspense>
      </div>
    </>
  );
}
