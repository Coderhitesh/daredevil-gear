import { Suspense } from 'react';
import Listing from '@/components/listing/Listing';
import { ProductGridSkeleton } from '@/components/product/ProductCard';
import PageHero from '@/components/layout/PageHero';

export const metadata = {
  title: 'Shop all products',
  description: 'Browse the full DareDevil Gears range — bags, camping kit, lighting, eyewear, footwear and more. GST-inclusive prices.',
  alternates: { canonical: '/shop' },
};

export default async function ShopPage({ searchParams }) {
  const sp = await searchParams;
  return (
    <>
      <PageHero
        crumbs={[{ name: 'Shop all', href: '/shop' }]}
        kicker="The full range"
        title="Shop all gear"
        subtitle="Bags, camp kit, lighting, eyewear, footwear and more. Every price includes GST."
      />
      <div className="wrap pt-8">
        <Suspense key={JSON.stringify(sp)} fallback={<ProductGridSkeleton />}>
          <Listing searchParams={sp} basePath="/shop" />
        </Suspense>
      </div>
    </>
  );
}
