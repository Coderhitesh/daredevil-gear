'use strict';

/* eslint-disable no-console */
/**
 * Seeds editable content and configuration. Insert-only: anything that already exists
 * (and may have been edited in the admin) is left untouched. Safe to run repeatedly.
 */
const { run } = require('./lib/cli');
const { CMSPage, HomeSection, Banner, NavigationMenu, ShippingZone, ShippingRate, Collection } = require('../src/models');
const settings = require('../src/services/settings.service');
const tax = require('../src/services/tax.service');
const { sanitizeRich } = require('../src/utils/text');
const pages = require('./data/pages');

const HOME_SECTIONS = [
  { key: 'hero', type: 'hero', sortOrder: 10 },
  { key: 'offers', type: 'offers', title: 'Offers', subtitle: 'Current deals. Prices shown are what you pay.', sortOrder: 15 },
  { key: 'combos', type: 'combos', title: 'Combo offers', subtitle: 'Buy together and pay less. Savings are worked out from today’s prices.', sortOrder: 16 },
  {
    key: 'trust',
    type: 'trust',
    title: 'Built for every explorer',
    sortOrder: 105,
    config: {
      items: [
        { title: 'Prices include GST', text: 'No hidden charges — packaging and delivery shown before you pay.', icon: 'receipt' },
        { title: 'Free delivery over ₹5,000', text: 'Delivery charge for smaller orders shown at checkout.', icon: 'truck' },
        { title: '7-day returns', text: 'Damaged or wrong item? Tell us within 48 hours.', icon: 'rotate' },
        { title: 'Secure payments', text: 'UPI, cards and net banking via CCAvenue.', icon: 'shield' },
      ],
    },
  },
  { key: 'featured-categories', type: 'featured_categories', title: 'Shop by category', subtitle: 'Kit for the trail, the camp and the field.', sortOrder: 30 },
  { key: 'bestsellers', type: 'product_rail', title: 'Most popular', subtitle: 'What customers are buying right now.', sortOrder: 40, config: { source: 'bestsellers', limit: 8, ctaLabel: 'Shop all', ctaHref: '/shop' } },
  {
    key: 'story',
    type: 'story',
    title: 'Built for the long way round',
    sortOrder: 50,
    config: {
      body: 'DareDevil Gears is a Made-in-India range of tactical and adventure gear — load-carrying bags, camp kit, lighting, eyewear and field footwear. We tell you exactly what each product is made of and what it is for, and we never make protection claims we cannot back with a test certificate.',
      ctaLabel: 'About us',
      ctaHref: '/about',
    },
  },
  { key: 'collection-adventure', type: 'collection_rail', title: 'Adventure Maniacs', subtitle: 'For treks, camps and rides in every season.', sortOrder: 60, config: { source: 'collection', limit: 8 } },
  { key: 'new-arrivals', type: 'product_rail', title: 'New in', sortOrder: 70, config: { source: 'new', limit: 8 } },
  { key: 'promo', type: 'promo_banners', sortOrder: 80 },
  { key: 'collection-soldiers', type: 'collection_rail', title: "Soldiers' Accessories", subtitle: 'Load carriage and field essentials.', sortOrder: 90, config: { source: 'collection', limit: 8 } },
  { key: 'recently-viewed', type: 'recently_viewed', title: 'Recently viewed', sortOrder: 100 },
  { key: 'reviews', type: 'reviews', title: 'What customers say', subtitle: 'Verified reviews from customers who received their order.', sortOrder: 110 },
  { key: 'bulk', type: 'bulk_orders', title: 'Bulk & institutional orders', sortOrder: 120, config: { body: 'Equipping a team, unit, school or expedition? Tell us what you need and where it should go — we will come back with a quote within one working day.', ctaLabel: 'Request a quote', ctaHref: '/bulk-orders' } },
  { key: 'newsletter', type: 'newsletter', title: 'Field notes, new gear and genuine offers', subtitle: 'An occasional email. Unsubscribe any time.', sortOrder: 130 },
];

const NAV = {
  footer_help: [
    { label: 'Track your order', href: '/track-order' },
    { label: 'Shipping policy', href: '/pages/shipping-policy' },
    { label: 'Returns & refunds', href: '/pages/return-refund-policy' },
    { label: 'Cancellation policy', href: '/pages/cancellation-policy' },
    { label: 'FAQ', href: '/pages/faq' },
    { label: 'Payment information', href: '/pages/payment-information' },
  ],
  footer_company: [
    { label: 'About us', href: '/about' },
    { label: 'Contact us', href: '/contact' },
    { label: 'Bulk & institutional orders', href: '/bulk-orders' },
    { label: 'Product safety', href: '/pages/product-safety' },
    { label: 'Grievance redressal', href: '/pages/grievance-redressal' },
  ],
  footer_legal: [
    { label: 'Terms & conditions', href: '/pages/terms-and-conditions' },
    { label: 'Privacy policy', href: '/pages/privacy-policy' },
  ],
};

// Weight-slab rate card from the "Dare Devil All Product" sheet's Shipping Charge formula (₹ → paise).
const RATE_CARDS = [
  { zone: 'All India (standard)', states: [], prefixes: [], active: true, slabs: [[0.5, 159], [1, 169], [2, 189], [5, 209]], beyond: 50, note: 'Uses the spreadsheet\'s "Normal Zones" slabs as the India-wide default. Confirm with management.' },
  { zone: 'Local zone', states: [], prefixes: [], active: false, slabs: [[0.5, 79], [1, 89], [2, 109], [5, 159]], beyond: 30, note: 'Spreadsheet "Local Zones" slabs. Add the local PIN-code prefixes, then activate.' },
  { zone: 'Special zone', states: [], prefixes: [], active: false, slabs: [[0.5, 189], [1, 209], [2, 229], [5, 309]], beyond: 70, note: 'Spreadsheet third-tier slabs (zone name not given in the sheet). Add states/PIN prefixes, then activate.' },
];

run('seed:content', async () => {
  await settings.ensureDefaults();
  await tax.ensureDefault();

  let created = 0;
  for (const p of pages) {
    const res = await CMSPage.updateOne({ slug: p.slug }, { $setOnInsert: { ...p, body: sanitizeRich(p.body), isPublished: p.isPublished !== false } }, { upsert: true });
    created += res.upsertedCount || 0;
  }
  console.log(`CMS pages: ${created} created, ${pages.length - created} already present`);

  const collections = Object.fromEntries((await Collection.find().lean()).map((c) => [c.slug, c._id]));
  let sections = 0;
  for (const s of HOME_SECTIONS) {
    const config = { ...(s.config || {}) };
    if (s.key === 'collection-adventure') config.collection = collections['adventure-maniacs'];
    if (s.key === 'collection-soldiers') config.collection = collections['soldiers-accessories'];
    const res = await HomeSection.updateOne({ key: s.key }, { $setOnInsert: { ...s, config, isVisible: true } }, { upsert: true });
    sections += res.upsertedCount || 0;
  }
  console.log(`Homepage sections: ${sections} created`);

  if (!(await Banner.exists({ placement: 'hero' }))) {
    await Banner.create({
      placement: 'hero',
      eyebrow: 'Made in India',
      title: 'Gear that goes the distance.',
      subtitle: 'Tactical bags, camp kit, lighting and field footwear — honest specs, GST-inclusive prices, no surprises at checkout.',
      ctaLabel: 'Shop the range',
      ctaHref: '/shop',
      secondaryCtaLabel: 'Bulk orders',
      secondaryCtaHref: '/bulk-orders',
      theme: 'dark',
      sortOrder: 1,
      isActive: true,
    });
    console.log('Hero banner created (upload photography in Admin → Banners)');
  }

  for (const [key, items] of Object.entries(NAV)) {
    await NavigationMenu.updateOne({ key }, { $setOnInsert: { key, items } }, { upsert: true });
  }

  if (!(await ShippingZone.exists({}))) {
    for (const [i, card] of RATE_CARDS.entries()) {
      const zone = await ShippingZone.create({ name: card.zone, scope: 'domestic', countries: ['IN'], states: card.states, pincodePrefixes: card.prefixes, isActive: card.active, sortOrder: i });
      await ShippingRate.create({
        zone: zone._id,
        name: 'Standard delivery',
        method: 'standard',
        type: 'weight_slab',
        slabs: card.slabs.map(([maxKg, rupees]) => ({ maxKg, charge: rupees * 100 })),
        beyondPerKg: card.beyond * 100,
        isActive: true,
        requiresReview: true,
        reviewNote: card.note,
      });
    }
    console.log('Shipping zones & weight-slab rates created (review in Admin → Shipping)');
  }
});
