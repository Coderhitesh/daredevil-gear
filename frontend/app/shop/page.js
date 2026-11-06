import { Suspense } from 'react';
import Listing from '@/components/listing/Listing';
import { ProductGridSkeleton } from '@/components/product/ProductCard';
import PageHero from '@/components/layout/PageHero';
import { priceOffer, priceOfferLabel } from '@/lib/price-offer';

export async function generateMetadata({ searchParams }) {
  const offer = priceOffer(await searchParams);
  return {
    title: offer ? `${priceOfferLabel(offer)} — Shop gear` : 'Shop all products',
    description: 'Browse the full DareDevil Gears range — bags, camping kit, lighting, eyewear, footwear and more. GST-inclusive prices.',
    alternates: { canonical: '/shop' },
  };
}

export default async function ShopPage({ searchParams }) {
  const sp = await searchParams;
  const offer = sp.minPrice || sp.maxPrice ? null : priceOffer(sp);
  const amount = offer ? `₹${offer.rupees.toLocaleString('en-IN')}` : '';
  return (
    <>
      <PageHero
        crumbs={offer ? [{ name: 'Shop all', href: '/shop' }, { name: priceOfferLabel(offer), href: `/shop?${offer.type === 'exact' ? 'price' : 'under'}=${offer.rupees}` }] : [{ name: 'Shop all', href: '/shop' }]}
        kicker={offer ? 'Price offer' : 'The full range'}
        title={offer ? (offer.type === 'exact' ? `Everything at ${amount}` : `Gear under ${amount}`) : 'Shop all gear'}
        subtitle={offer ? (offer.type === 'exact' ? `Products selling at ${amount}, GST included.` : `Products up to ${amount}, GST included. Sale prices count.`) : 'Bags, camp kit, lighting, eyewear, footwear and more. Every price includes GST.'}
      />
      <div className="wrap pt-8">
        <Suspense key={JSON.stringify(sp)} fallback={<ProductGridSkeleton />}>
          <Listing searchParams={sp} basePath="/shop" />
        </Suspense>
      </div>
    </>
  );
}
