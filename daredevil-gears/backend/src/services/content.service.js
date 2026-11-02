'use strict';

const { Banner, HomeSection, CMSPage, NavigationMenu, Product, Collection, Category } = require('../models');
const catalog = require('./catalog.service');
const reviews = require('./review.service');
const settings = require('./settings.service');
const { ApiError } = require('../utils/http');

function activeWindow(now = new Date()) {
  return { isActive: true, $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: now } }] }, { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] }] };
}

function serialiseBanner(b) {
  return {
    id: String(b._id),
    title: b.title,
    eyebrow: b.eyebrow,
    subtitle: b.subtitle,
    ctaLabel: b.ctaLabel,
    ctaHref: b.ctaHref,
    secondaryCtaLabel: b.secondaryCtaLabel,
    secondaryCtaHref: b.secondaryCtaHref,
    linkHref: b.linkHref || null,
    openInNewTab: Boolean(b.openInNewTab),
    layout: b.layout || 'overlay',
    durationSeconds: b.durationSeconds || 6,
    image: b.image?.desktop ? b.image : null,
    theme: b.theme,
  };
}

async function sectionProducts(cfg) {
  const limit = Math.min(cfg.limit || 8, 24);
  switch (cfg.source) {
    case 'manual':
      return catalog.productsByIds((cfg.products || []).slice(0, limit));
    case 'collection': {
      const col = cfg.collection ? await Collection.findById(cfg.collection).lean() : null;
      return col ? catalog.productsByIds(col.products.slice(0, limit)) : [];
    }
    case 'category': {
      const cat = cfg.category ? await Category.findById(cfg.category).lean() : null;
      return cat ? (await catalog.listProducts({ category: cat.slug, limit, sort: 'popular' })).items : [];
    }
    case 'bestsellers':
      return (await catalog.listProducts({ limit, sort: 'popular', inStock: false })).items;
    case 'featured':
      return (await catalog.listProducts({ limit, sort: 'featured' })).items;
    case 'new':
    default:
      return (await catalog.listProducts({ limit, sort: 'newest' })).items;
  }
}

/** Fully resolved homepage: ordered visible sections with their data. */
async function homepage() {
  const sections = await HomeSection.find({ isVisible: true }).sort({ sortOrder: 1 }).lean();
  const out = [];
  for (const s of sections) {
    const base = { key: s.key, type: s.type, title: s.title, subtitle: s.subtitle, config: { source: s.config?.source, body: s.config?.body, image: s.config?.image, imageAlt: s.config?.imageAlt, ctaLabel: s.config?.ctaLabel, ctaHref: s.config?.ctaHref, items: s.config?.items || [] } };
    if (s.type === 'hero') {
      const banners = await Banner.find({ ...activeWindow(), placement: 'hero' }).sort({ sortOrder: 1 }).lean();
      if (banners.length) out.push({ ...base, banners: banners.map(serialiseBanner) });
    } else if (s.type === 'promo_banners') {
      const banners = await Banner.find({ ...activeWindow(), placement: 'promo' }).sort({ sortOrder: 1 }).lean();
      if (banners.length) out.push({ ...base, banners: banners.map(serialiseBanner) });
    } else if (s.type === 'featured_categories') {
      const tree = await catalog.categoryTree();
      const chosen = s.config?.categories?.length ? s.config.categories.map(String) : null;
      const cats = tree.filter((c) => (chosen ? chosen.includes(c.id) : c.isFeatured)).slice(0, 8);
      if (cats.length) out.push({ ...base, categories: cats });
    } else if (s.type === 'product_rail' || s.type === 'collection_rail') {
      const products = await sectionProducts(s.config || {});
      let link = null;
      if (s.config?.source === 'collection' && s.config.collection) {
        const col = await Collection.findById(s.config.collection).select('slug').lean();
        if (col) link = `/collections/${col.slug}`;
      }
      if (products.length) out.push({ ...base, products, link: s.config?.ctaHref || link });
    } else if (s.type === 'reviews') {
      const items = await reviews.latestApproved(6);
      if (items.length) out.push({ ...base, reviews: items }); // never shown when there are no genuine reviews
    } else {
      out.push(base);
    }
  }
  return out;
}

async function page(slug) {
  const p = await CMSPage.findOne({ slug, isPublished: true }).lean();
  if (!p) throw ApiError.notFound('Page not found');
  return { slug: p.slug, title: p.title, body: p.body, excerpt: p.excerpt, group: p.group, seo: p.seo || {}, updatedAt: p.updatedAt, requiresReview: p.requiresReview };
}

async function pagesIndex() {
  const pages = await CMSPage.find({ isPublished: true }).select('slug title group sortOrder').sort({ group: 1, sortOrder: 1 }).lean();
  return pages.map((p) => ({ slug: p.slug, title: p.title, group: p.group }));
}

async function navigation() {
  const menus = await NavigationMenu.find().lean();
  const map = Object.fromEntries(menus.map((m) => [m.key, m.items]));
  return map;
}

/** Everything the storefront shell needs in one request. */
async function shell() {
  const [settingsPublic, categories, nav, pages] = await Promise.all([settings.publicSettings(), catalog.categoryTree(), navigation(), pagesIndex()]);
  return { settings: settingsPublic, categories, navigation: nav, pages };
}

async function sitemapEntries() {
  const [products, categories, pages, collections] = await Promise.all([
    Product.find({ status: 'published' }).select('slug updatedAt').lean(),
    catalog.categoryTree(),
    CMSPage.find({ isPublished: true }).select('slug updatedAt').lean(),
    catalog.listCollections(),
  ]);
  const flat = [];
  const walk = (nodes) => nodes.forEach((n) => (flat.push(n), walk(n.children || [])));
  walk(categories);
  return {
    products: products.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt })),
    categories: flat.map((c) => ({ slug: c.slug })),
    pages: pages.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt })),
    collections: collections.map((c) => ({ slug: c.slug })),
  };
}

module.exports = { homepage, page, pagesIndex, navigation, shell, sitemapEntries, serialiseBanner };
