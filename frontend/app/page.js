import { Fragment } from 'react';
import { apiGet, getShell } from '@/lib/api-server';
import Hero from '@/components/home/Hero';
import CategoryIcons from '@/components/home/CategoryIcons';
import TrustStrip from '@/components/home/TrustStrip';
import TrailTicker from '@/components/home/TrailTicker';
import OffersSection from '@/components/home/OffersSection';
import CombosSection from '@/components/home/CombosSection';
import CategoryTiles from '@/components/home/CategoryTiles';
import ProductRail from '@/components/home/ProductRail';
import Story from '@/components/home/Story';
import PromoBanners from '@/components/home/PromoBanners';
import RecentlyViewed from '@/components/home/RecentlyViewed';
import ReviewsStrip from '@/components/home/ReviewsStrip';
import BulkBand from '@/components/home/BulkBand';

export const revalidate = 60;

const RAIL_KICKER = { bestsellers: 'Best selling', new: 'New arrivals', featured: 'Featured', manual: 'Hand-picked', category: 'Shop the range', collection: 'Collection' };

export default async function HomePage() {
  const [sections, shell] = await Promise.all([apiGet('/storefront/home', { revalidate: 60, tags: ['home'] }), getShell().catch(() => ({ categories: [] }))]);
  const navCats = (shell.categories || []).filter((c) => c.showInNav && c.productCount > 0);
  const trust = sections.find((s) => s.type === 'trust')?.config?.items || [];
  const stats = { products: navCats.reduce((n, c) => n + (c.productCount || 0), 0), categories: navCats.length };

  const render = {
    hero: (s) => (
      <Fragment key={s.key}>
        <Hero banners={s.banners} trust={trust} />
        <TrailTicker items={trust} />
        <CategoryIcons categories={navCats} />
      </Fragment>
    ),
    trust: (s) => <TrustStrip key={s.key} title={s.title} items={s.config.items} />,
    offers: (s) => <OffersSection key={s.key} title={s.title} subtitle={s.subtitle} posts={s.posts} />,
    combos: (s) => <CombosSection key={s.key} title={s.title} subtitle={s.subtitle} combos={s.combos} multiBuys={s.multiBuys} />,
    featured_categories: (s) => <CategoryTiles key={s.key} title={s.title} subtitle={s.subtitle} categories={s.categories} />,
    product_rail: (s) => <ProductRail key={s.key} kicker={RAIL_KICKER[s.config.source] || 'Shop'} title={s.title} subtitle={s.subtitle} products={s.products} link={s.link} linkLabel={s.config.ctaLabel} markNew={s.config.source === 'new'} />,
    collection_rail: (s) => <ProductRail key={s.key} kicker="Collection" title={s.title} subtitle={s.subtitle} products={s.products} link={s.link} linkLabel={s.config.ctaLabel || 'View collection'} />,
    story: (s) => <Story key={s.key} title={s.title} config={s.config} stats={stats} />,
    promo_banners: (s) => <PromoBanners key={s.key} banners={s.banners} />,
    recently_viewed: (s) => <RecentlyViewed key={s.key} title={s.title} />,
    reviews: (s) => <ReviewsStrip key={s.key} title={s.title} subtitle={s.subtitle} reviews={s.reviews} />,
    bulk_orders: (s) => <BulkBand key={s.key} title={s.title} config={s.config} />,
    // the newsletter sign-up is part of the site-wide footer band
    newsletter: () => null,
  };

  return <div className="pb-4">{sections.map((s) => render[s.type]?.(s) ?? null)}</div>;
}
