import { apiGet, siteUrl } from '@/lib/api-server';
import Breadcrumbs from '@/components/listing/Breadcrumbs';
import Gallery from '@/components/product/Gallery';
import BuyBox from '@/components/product/BuyBox';
import ProductDetails from '@/components/product/ProductDetails';
import Reviews from '@/components/product/Reviews';
import ProductRail from '@/components/home/ProductRail';
import RecentlyViewed from '@/components/home/RecentlyViewed';
import ViewTracker from '@/components/product/ViewTracker';
import Stars from '@/components/product/Stars';
import ComboOffers from '@/components/product/ComboOffers';

export const revalidate = 60;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const p = await apiGet(`/products/${slug}`, { revalidate: 60, allow404: true });
  if (!p) return { title: 'Product not found' };
  const img = p.images?.[0]?.url;
  return {
    title: p.seo.title.replace(/ \| DareDevil Gears$/, ''),
    description: p.seo.description,
    alternates: { canonical: p.seo.canonical || `/product/${p.slug}` },
    robots: p.seo.noindex ? { index: false } : undefined,
    openGraph: { type: 'website', title: p.name, description: p.seo.description, images: img ? [img] : undefined },
  };
}

function productJsonLd(p) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    sku: p.sku,
    description: p.seo.description || p.shortDescription,
    image: p.images.map((i) => i.url),
    category: p.category?.name,
    brand: p.brand ? { '@type': 'Brand', name: p.brand.name } : undefined,
    countryOfOrigin: p.statutory.countryOfOrigin || undefined,
    offers: {
      '@type': 'Offer',
      url: `${siteUrl()}/product/${p.slug}`,
      priceCurrency: 'INR',
      price: (p.price / 100).toFixed(2),
      availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'DareDevil Gears' },
    },
  };
  // only genuine, approved reviews produce rating markup
  if (p.rating?.count) ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: p.rating.average, reviewCount: p.rating.count };
  return ld;
}

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const [p, related] = await Promise.all([apiGet(`/products/${slug}`, { revalidate: 60, tags: [`product:${slug}`] }), apiGet(`/products/${slug}/related`, { revalidate: 300 }).catch(() => [])]);

  return (
    <>
      <div className="wrap pt-6">
        <Breadcrumbs items={[...(p.category ? [{ name: p.category.name, href: `/category/${p.category.slug}` }] : []), { name: p.name, href: `/product/${p.slug}` }]} />
        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
          <Gallery images={p.images} videos={p.videos} name={p.name} />
          <div className="lg:sticky lg:top-32 lg:self-start">
            {p.brand ? <p className="text-sm text-graphite-400">{p.brand.name}</p> : null}
            <h1 className="font-display text-display-md">{p.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-graphite">
              <span>SKU {p.sku}</span>
              {p.rating ? (
                <a href="#reviews" className="inline-flex items-center gap-1.5 hover:underline">
                  <Stars value={p.rating.average} size={14} />
                  <span className="tabular">
                    {p.rating.average} ({p.rating.count})
                  </span>
                </a>
              ) : null}
            </div>
            <BuyBox product={p} />
          </div>
        </div>
      </div>

      <ComboOffers slug={p.slug} />
      <ProductDetails product={p} />
      <Reviews slug={p.slug} productId={p.id} summary={p.rating} />
      <ProductRail title="You may also need" products={related} link={p.category ? `/category/${p.category.slug}` : undefined} linkLabel={p.category ? `More in ${p.category.name}` : undefined} />
      <RecentlyViewed excludeId={p.id} />
      <ViewTracker id={p.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(p)).replace(/</g, '\\u003c') }} />
    </>
  );
}
