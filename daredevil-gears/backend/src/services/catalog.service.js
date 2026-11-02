'use strict';

const { Product, ProductVariant, Category, Collection, Brand } = require('../models');
const { unitPrice, isSaleActive } = require('./pricing.service');
const { ApiError } = require('../utils/http');
const { escapeRegex } = require('../utils/text');
const settings = require('./settings.service');

const PUBLIC_STATUS = 'published';

// ---------------- categories ----------------

let catCache = { at: 0, data: null };
async function activeCategories() {
  if (catCache.data && Date.now() - catCache.at < 30_000) return catCache.data;
  const cats = await Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
  catCache = { at: Date.now(), data: cats };
  return cats;
}
function clearCategoryCache() {
  catCache = { at: 0, data: null };
}

function serialiseCategory(c) {
  return {
    id: String(c._id),
    name: c.name,
    slug: c.slug,
    parent: c.parent ? String(c.parent) : null,
    description: c.description || '',
    image: c.image || null,
    banner: c.banner || null,
    productCount: c.productCount || 0,
    isFeatured: Boolean(c.isFeatured),
    showInNav: c.showInNav !== false,
    seo: c.seo || {},
  };
}

async function categoryTree() {
  const cats = (await activeCategories()).filter((c) => c.productCount > 0 || c.parent);
  const nodes = cats.map((c) => ({ ...serialiseCategory(c), children: [] }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots = [];
  for (const n of nodes) {
    if (n.parent && byId.has(n.parent)) byId.get(n.parent).children.push(n);
    else if (!n.parent) roots.push(n);
  }
  // hide empty branches (fix plan item 12: no empty categories in navigation)
  return roots.filter((r) => r.productCount > 0 || r.children.some((ch) => ch.productCount > 0));
}

async function categoryBySlug(slug) {
  const cats = await activeCategories();
  const cat = cats.find((c) => c.slug === slug);
  if (!cat) throw ApiError.notFound('Category not found');
  const children = cats.filter((c) => String(c.parent) === String(cat._id));
  const ancestors = (cat.ancestors || []).map((id) => cats.find((c) => String(c._id) === String(id))).filter(Boolean);
  return { category: cat, children, ancestors };
}

// ---------------- product serialisation ----------------

function publicImages(p) {
  return (p.images || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((i) => ({ url: i.url, alt: i.alt || p.name, width: i.width, height: i.height }));
}

function priceView(p, variant) {
  const pr = unitPrice(p, variant);
  return {
    price: pr.unit,
    regularPrice: pr.regular,
    onSale: pr.onSale,
    saleEndsAt: pr.onSale ? pr.saleEndsAt : null,
    discountPct: pr.onSale ? Math.round(((pr.regular - pr.unit) / pr.regular) * 100) : 0,
    taxInclusive: true,
    packagingCharge: p.packagingCharge || 0,
  };
}

function serialiseCard(p, category) {
  return {
    id: String(p._id),
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    image: publicImages(p)[0] || null,
    category: category ? { name: category.name, slug: category.slug } : p.category?.slug ? { name: p.category.name, slug: p.category.slug } : null,
    ...priceView(p),
    inStock: p.stockStatus === 'in_stock',
    rating: p.ratings?.count ? { average: Math.round(p.ratings.average * 10) / 10, count: p.ratings.count } : null,
    variantLabel: p.variantLabel || null,
    minAge: p.compliance?.minAge || 0,
    domesticOnly: Boolean(p.compliance?.domesticOnly),
  };
}

async function serialiseDetail(p) {
  const [variants, siblings, brand, category, packagingMode] = await Promise.all([
    ProductVariant.find({ product: p._id, isActive: true }).sort({ isDefault: -1, sortOrder: 1 }).lean(),
    p.variantGroup ? Product.find({ variantGroup: p.variantGroup, status: PUBLIC_STATUS, _id: { $ne: p._id } }).select('name slug variantLabel images stockStatus').lean() : [],
    p.brand ? Brand.findById(p.brand).lean() : null,
    Category.findById(p.category).lean(),
    settings.get('checkout').then((c) => c?.packagingMode || 'per_line'),
  ]);
  const c = p.compliance || {};
  return {
    ...serialiseCard(p, category),
    shortDescription: p.shortDescription || '',
    description: p.description || '',
    features: p.features || [],
    specifications: (p.specifications || []).filter((s) => s.isPublic !== false).map((s) => ({ label: s.label, value: s.value })),
    images: publicImages(p),
    videos: (p.videos || []).map((v) => ({ url: v.url, provider: v.provider, title: v.title })),
    brand: brand ? { name: brand.name, slug: brand.slug } : null,
    category: category ? { name: category.name, slug: category.slug, id: String(category._id) } : null,
    hsnCode: p.hsnCode || null,
    gstRate: p.pricing?.gstRule === 'fixed' ? p.pricing.gstRate : null,
    packagingMode,
    variants: variants.map((v) => ({
      id: String(v._id),
      sku: v.sku,
      title: v.title,
      options: v.options instanceof Map ? Object.fromEntries(v.options) : v.options || {},
      isDefault: v.isDefault,
      inStock: v.trackInventory === false || v.available > 0,
      maxQuantity: v.trackInventory === false ? 10 : Math.max(0, Math.min(10, v.available)),
      ...priceView(p, v),
    })),
    siblings: siblings.map((s) => ({ name: s.name, slug: s.slug, label: s.variantLabel, image: publicImages(s)[0] || null, inStock: s.stockStatus === 'in_stock' })),
    statutory: {
      countryOfOrigin: c.countryOfOrigin || null,
      manufacturer: c.manufacturer?.name ? c.manufacturer : null,
      importer: c.importer?.name ? c.importer : null,
      packer: c.packer?.name ? c.packer : null,
      netQuantity: c.netQuantity || null,
      consumerCare: c.consumerCare || null,
    },
    safety: {
      warnings: c.warnings || [],
      instructions: c.safetyInstructions || null,
      minAge: c.minAge || 0,
      domesticOnly: Boolean(c.domesticOnly),
      dangerousGoods: Boolean(c.dangerousGoods),
      certificates: (c.certificates || []).filter((x) => x.verified).map((x) => ({ name: x.name, standard: x.standard, issuedBy: x.issuedBy, fileUrl: x.fileUrl })),
    },
    returns: { returnable: c.returnable !== false, windowDays: c.returnWindowDays || 7 },
    seo: {
      title: p.seo?.title || `${p.name} | DareDevil Gears`,
      description: p.seo?.description || p.shortDescription || '',
      canonical: p.seo?.canonical || null,
      noindex: Boolean(p.seo?.noindex),
    },
    updatedAt: p.updatedAt,
  };
}

// ---------------- listing ----------------

const SORTS = {
  newest: { createdAt: -1 },
  price_asc: { 'pricing.priceInclusive': 1, _id: 1 },
  price_desc: { 'pricing.priceInclusive': -1, _id: 1 },
  popular: { salesCount: -1, viewCount: -1, _id: 1 },
  rating: { 'ratings.average': -1, 'ratings.count': -1, _id: 1 },
  name: { name: 1 },
  featured: { isFeatured: -1, salesCount: -1, createdAt: -1 },
};

async function buildFilter({ category, collection, brand, minPrice, maxPrice, inStock, ids, q }) {
  const cats = await activeCategories();
  const activeIds = cats.map((c) => c._id);
  const filter = { status: PUBLIC_STATUS, category: { $in: activeIds } };
  if (category) {
    const cat = cats.find((c) => c.slug === category);
    if (!cat) throw ApiError.notFound('Category not found');
    const descendant = cats.filter((c) => (c.ancestors || []).some((a) => String(a) === String(cat._id))).map((c) => c._id);
    filter.category = { $in: [cat._id, ...descendant] };
  }
  if (collection) {
    const col = await Collection.findOne({ slug: collection, isActive: true }).select('products').lean();
    if (!col) throw ApiError.notFound('Collection not found');
    filter._id = { $in: col.products };
  }
  if (ids?.length) filter._id = { $in: ids };
  if (brand) {
    const brands = await Brand.find({ slug: { $in: String(brand).split(',') } }).select('_id').lean();
    filter.brand = { $in: brands.map((b) => b._id) };
  }
  if (minPrice != null || maxPrice != null) {
    filter['pricing.priceInclusive'] = {};
    if (minPrice != null) filter['pricing.priceInclusive'].$gte = minPrice;
    if (maxPrice != null) filter['pricing.priceInclusive'].$lte = maxPrice;
  }
  if (inStock) filter.stockStatus = 'in_stock';
  if (q) {
    const tokens = String(q).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
    if (tokens.length) filter.$and = tokens.map((t) => ({ searchText: { $regex: escapeRegex(t), $options: 'i' } }));
  }
  return filter;
}

async function listProducts(params) {
  const { page = 1, limit = 24, sort = 'featured' } = params;
  const filter = await buildFilter(params);
  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort(SORTS[sort] || SORTS.featured)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('category', 'name slug')
      .lean(),
    Product.countDocuments(filter),
  ]);
  return { items: items.map((p) => serialiseCard(p)), total };
}

async function facets(params) {
  const filter = await buildFilter({ ...params, minPrice: null, maxPrice: null, brand: null, inStock: false });
  const products = await Product.find(filter).select('pricing.priceInclusive stockStatus brand').lean();
  const brandIds = [...new Set(products.map((p) => String(p.brand || '')).filter(Boolean))];
  const brands = brandIds.length ? await Brand.find({ _id: { $in: brandIds } }).lean() : [];
  const prices = products.map((p) => p.pricing.priceInclusive);
  return {
    price: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    availability: { inStock: products.filter((p) => p.stockStatus === 'in_stock').length, total: products.length },
    brands: brands.map((b) => ({ name: b.name, slug: b.slug, count: products.filter((p) => String(p.brand) === String(b._id)).length })),
  };
}

async function productBySlug(slug) {
  const p = await Product.findOne({ slug, status: PUBLIC_STATUS }).lean();
  if (!p) throw ApiError.notFound('Product not found');
  const cat = await Category.findById(p.category).select('isActive').lean();
  if (!cat?.isActive) throw ApiError.notFound('Product not found');
  Product.updateOne({ _id: p._id }, { $inc: { viewCount: 1 } }).catch(() => {});
  return serialiseDetail(p);
}

async function relatedProducts(slug, limit = 8) {
  const p = await Product.findOne({ slug, status: PUBLIC_STATUS }).select('category variantGroup').lean();
  if (!p) return [];
  const items = await Product.find({ status: PUBLIC_STATUS, category: p.category, _id: { $ne: p._id }, ...(p.variantGroup ? { variantGroup: { $ne: p.variantGroup } } : {}) })
    .sort({ stockStatus: 1, salesCount: -1 })
    .limit(limit)
    .populate('category', 'name slug')
    .lean();
  return items.map((x) => serialiseCard(x));
}

async function productsByIds(ids) {
  const items = await Product.find({ _id: { $in: ids }, status: PUBLIC_STATUS }).populate('category', 'name slug').lean();
  const order = new Map(ids.map((id, i) => [String(id), i]));
  return items.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id))).map((p) => serialiseCard(p));
}

async function collectionBySlug(slug) {
  const col = await Collection.findOne({ slug, isActive: true }).lean();
  if (!col) throw ApiError.notFound('Collection not found');
  return { name: col.name, slug: col.slug, description: col.description, image: col.image || null, seo: col.seo || {} };
}

async function listCollections() {
  const cols = await Collection.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
  return cols.filter((c) => c.products?.length).map((c) => ({ name: c.name, slug: c.slug, description: c.description, image: c.image || null, count: c.products.length }));
}

async function refreshCategoryCounts() {
  const cats = await Category.find().select('_id ancestors').lean();
  for (const c of cats) {
    const descendants = cats.filter((x) => (x.ancestors || []).some((a) => String(a) === String(c._id))).map((x) => x._id);
    const count = await Product.countDocuments({ status: PUBLIC_STATUS, category: { $in: [c._id, ...descendants] } });
    await Category.updateOne({ _id: c._id }, { $set: { productCount: count } });
  }
  clearCategoryCache();
}

module.exports = {
  activeCategories,
  clearCategoryCache,
  serialiseCategory,
  categoryTree,
  categoryBySlug,
  serialiseCard,
  serialiseDetail,
  priceView,
  listProducts,
  facets,
  productBySlug,
  relatedProducts,
  productsByIds,
  collectionBySlug,
  listCollections,
  refreshCategoryCounts,
  isSaleActive,
  SORTS,
};
