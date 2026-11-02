'use strict';

const { Product, ProductVariant, Category, CatalogBlocklist, Order } = require('../models');
const { ApiError } = require('../utils/http');
const { slugify, nameKey, sanitizeRich } = require('../utils/text');
const compliance = require('./compliance.service');
const inventory = require('./inventory.service');
const catalog = require('./catalog.service');
const { DEPARTMENTS } = require('./import/catalog-map');
const { PRODUCT_STATUS: PS } = require('../shared');

const TRACKED = ['name', 'description', 'shortDescription', 'features', 'specifications', 'pricing', 'hsnCode', 'packagingCharge', 'weightKg', 'compliance', 'brand', 'category', 'seo', 'variantGroup', 'variantLabel'];

async function nextSku(categoryId) {
  const cat = await Category.findById(categoryId).lean();
  const dept = DEPARTMENTS.find((d) => d.slug === cat?.slug);
  const code = dept?.code || 'GEN';
  const existing = await ProductVariant.find({ sku: new RegExp(`^DDG-${code}-\\d{3,}`) }).select('sku').lean();
  const max = existing.reduce((m, v) => Math.max(m, parseInt(v.sku.split('-')[2], 10) || 0), 0);
  return `DDG-${code}-${String(max + 1).padStart(3, '0')}`;
}

async function uniqueSlug(base, excludeId) {
  const root = slugify(base) || 'product';
  let slug = root;
  for (let i = 2; await Product.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }); i++) slug = `${root}-${i}`;
  return slug;
}

async function categoryPath(categoryId) {
  const cat = await Category.findById(categoryId).lean();
  if (!cat) throw ApiError.badRequest('Category not found');
  return { cat, path: [...(cat.ancestors || []), cat._id] };
}

/** Re-scan content and merge with existing flags (keeps resolutions for still-relevant codes). */
function rescan(product) {
  const specs = (product.specifications || []).map((s) => ({ ...(s.toObject?.() || s), ...compliance.classifySpec(s), isPublic: s.isPublic === false ? false : compliance.classifySpec(s).isPublic }));
  product.specifications = specs;
  const scan = compliance.scanProduct({ name: product.name, description: product.description, shortDescription: product.shortDescription, features: product.features, specifications: specs });
  const old = new Map((product.flags || []).map((f) => [`${f.code}|${f.field}`, f]));
  const keepCodes = new Set(['source_price_unconfirmed', 'source_review_note', 'brand_unconfirmed', 'stock_missing', 'image_missing']);
  const merged = scan.flags.map((f) => {
    const prev = old.get(`${f.code}|${f.field}`);
    return prev?.resolvedAt ? prev : f;
  });
  for (const f of product.flags || []) {
    if (keepCodes.has(f.code) && !merged.some((m) => m.code === f.code)) merged.push(f);
  }
  // auto-resolve housekeeping flags
  for (const f of merged) {
    if (f.code === 'image_missing' && product.images?.length && !f.resolvedAt) f.resolvedAt = new Date();
  }
  product.flags = merged;
  return scan;
}

async function blocklistWarning(name) {
  const hit = await CatalogBlocklist.findOne({ key: nameKey(name), list: { $in: ['hide', 'remove'] } }).lean();
  return hit ? `“${hit.name}” is on the ${hit.list} list${hit.reason ? ` (${hit.reason})` : ''}` : null;
}

function cleanInput(input) {
  const out = { ...input };
  // product copy is stored as plain text (paragraphs separated by blank lines); markup is stripped
  const strip = (s) => sanitizeRich(String(s)).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  if (typeof out.description === 'string') out.description = strip(out.description);
  if (typeof out.shortDescription === 'string') out.shortDescription = strip(out.shortDescription);
  if (Array.isArray(out.features)) out.features = out.features.map(strip).filter(Boolean);
  return out;
}

async function create(input, actor) {
  const data = cleanInput(input);
  const { cat, path } = await categoryPath(data.category);
  const sku = (data.sku || (await nextSku(cat._id))).toUpperCase();
  if (await ProductVariant.exists({ sku })) throw ApiError.conflict(`SKU ${sku} already exists`);
  const product = new Product({
    ...data,
    sku,
    slug: await uniqueSlug(data.slug || data.name),
    categoryPath: path,
    status: PS.DRAFT,
    statusHistory: [{ from: null, to: PS.DRAFT, by: actor._id, note: 'Created in admin' }],
    manuallyEditedFields: TRACKED,
    createdBy: actor._id,
    updatedBy: actor._id,
  });
  rescan(product);
  await product.save();
  const stock = Math.max(0, parseInt(data.initialStock, 10) || 0);
  const variant = await ProductVariant.create({ product: product._id, sku, title: 'Default', isDefault: true, stock: 0, available: 0, weightKg: data.weightKg });
  if (stock) await inventory.adjust(variant._id, stock, { reason: 'Opening stock (admin)', actor: actor._id, type: 'adjustment' });
  return { product, warning: await blocklistWarning(product.name) };
}

async function update(id, input, actor) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  const data = cleanInput(input);
  const edited = new Set(product.manuallyEditedFields || []);
  for (const [k, v] of Object.entries(data)) {
    if (['status', 'flags', 'source', 'statusHistory', 'sku', 'ratings', 'salesCount', 'availableQty', 'stockStatus', 'images', 'initialStock'].includes(k)) continue;
    if (k === 'slug') {
      if (v && v !== product.slug) product.slug = await uniqueSlug(v, product._id);
      continue;
    }
    if (k === 'category') {
      const { path } = await categoryPath(v);
      product.category = v;
      product.categoryPath = path;
      edited.add('category');
      continue;
    }
    if (k === 'pricing') {
      const cur = product.pricing?.toObject?.() || {};
      product.pricing = { ...cur, ...v, sale: v.sale !== undefined ? v.sale : cur.sale };
      if (product.pricing.sale?.active && !product.pricing.sale.referencePriceEvidence) {
        throw ApiError.unprocessable('A sale needs a note of where the regular price was actually charged (genuine-discount rule)', { code: 'SALE_EVIDENCE_REQUIRED' });
      }
      if (product.pricing.sale?.active && product.pricing.sale.priceInclusive >= product.pricing.priceInclusive) {
        throw ApiError.unprocessable('Sale price must be lower than the regular price');
      }
      edited.add('pricing');
      continue;
    }
    if (k === 'compliance') {
      const cur = product.compliance?.toObject?.() || {};
      product.compliance = { ...cur, ...v, legalReview: cur.legalReview };
      edited.add('compliance');
      continue;
    }
    product.set(k, v);
    if (TRACKED.includes(k)) edited.add(k);
  }
  product.manuallyEditedFields = [...edited];
  product.updatedBy = actor._id;
  rescan(product);
  // published products that gain a blocking flag drop back to review
  if (product.status === PS.PUBLISHED && compliance.publishBlockers(product).length) {
    product.statusHistory.push({ from: PS.PUBLISHED, to: PS.REVIEW, by: actor._id, note: `Moved to review: ${compliance.publishBlockers(product).join('; ')}` });
    product.status = PS.REVIEW;
  }
  await product.save();
  if (data.weightKg !== undefined) await ProductVariant.updateMany({ product: product._id, isDefault: true }, { $set: { weightKg: data.weightKg } });
  await catalog.refreshCategoryCounts();
  return product;
}

async function setStatus(id, to, { note, actor }) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  const from = product.status;
  if (from === to) return product;
  if (to === PS.PUBLISHED) {
    const cat = await Category.findById(product.category).lean();
    const blockers = compliance.publishBlockers(product, { categoryActive: Boolean(cat?.isActive) });
    if (blockers.length) throw ApiError.unprocessable(`Cannot publish yet: ${blockers.join('; ')}`, { code: 'PUBLISH_BLOCKED', details: blockers.map((b) => ({ field: 'product', message: b })) });
    product.publishedAt = product.publishedAt || new Date();
  }
  if (to === PS.ARCHIVED) product.archivedAt = new Date();
  product.status = to;
  product.statusHistory.push({ from, to, by: actor._id, note });
  product.manuallyEditedFields = [...new Set([...(product.manuallyEditedFields || []), 'status'])];
  await product.save();
  await catalog.refreshCategoryCounts();
  return product;
}

async function resolveFlag(id, flagId, { note, actor }) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  const flag = product.flags.id(flagId);
  if (!flag) throw ApiError.notFound('Flag not found');
  if (!note || note.trim().length < 10) throw ApiError.badRequest('Explain how this was resolved (at least 10 characters) — e.g. certificate reference');
  flag.resolvedAt = new Date();
  flag.resolvedBy = actor._id;
  flag.resolutionNote = note;
  await product.save();
  return product;
}

async function legalReview(id, { status, notes, actor }) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  product.compliance.legalReview = { required: true, status, notes, reviewedBy: actor._id, reviewedAt: new Date() };
  if (status === 'approved') {
    for (const f of product.flags) if (['restricted_stun', 'force_insignia', 'restricted_sale_label'].includes(f.code) && !f.resolvedAt) Object.assign(f, { resolvedAt: new Date(), resolvedBy: actor._id, resolutionNote: `Legal review approved: ${notes}` });
  }
  await product.save();
  return product;
}

/** Soft delete: products referenced by orders are archived, never removed. */
async function remove(id, actor) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  const referenced = await Order.exists({ 'items.product': product._id });
  if (referenced || product.status !== PS.DRAFT) return setStatus(id, PS.ARCHIVED, { note: 'Archived instead of deleted', actor });
  await ProductVariant.deleteMany({ product: product._id });
  await product.deleteOne();
  return null;
}

async function adminDetail(id) {
  const product = await Product.findById(id).populate('category', 'name slug isActive').populate('brand', 'name slug').lean();
  if (!product) throw ApiError.notFound('Product not found');
  const variants = await ProductVariant.find({ product: id }).sort({ isDefault: -1, sortOrder: 1 }).lean();
  return {
    ...product,
    variants,
    publishBlockers: compliance.publishBlockers(product, { categoryActive: Boolean(product.category?.isActive) }),
    statutoryMissing: compliance.statutoryWarnings(product),
  };
}

// ---------------- variants ----------------

async function addVariant(productId, { title, options, priceInclusive, sku, weightKg, initialStock }, actor) {
  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');
  const count = await ProductVariant.countDocuments({ product: productId });
  const finalSku = (sku || `${product.sku}-${String(count + 1).padStart(2, '0')}`).toUpperCase();
  if (await ProductVariant.exists({ sku: finalSku })) throw ApiError.conflict(`SKU ${finalSku} already exists`);
  const v = await ProductVariant.create({ product: productId, sku: finalSku, title, options, priceInclusive, weightKg, isDefault: false, sortOrder: count });
  if (initialStock) await inventory.adjust(v._id, initialStock, { reason: 'Opening stock (new variant)', actor: actor._id });
  return v;
}

async function updateVariant(productId, variantId, patch) {
  const v = await ProductVariant.findOne({ _id: variantId, product: productId });
  if (!v) throw ApiError.notFound('Variant not found');
  for (const k of ['title', 'options', 'priceInclusive', 'lowStockThreshold', 'isActive', 'sortOrder', 'weightKg', 'barcode', 'trackInventory']) if (patch[k] !== undefined) v[k] = patch[k];
  if (patch.isActive === false && v.isDefault) {
    const others = await ProductVariant.countDocuments({ product: productId, isActive: true, _id: { $ne: v._id } });
    if (!others) throw ApiError.badRequest('A product needs at least one active option');
  }
  await v.save();
  await inventory.syncProductStock(productId);
  return v;
}

module.exports = { create, update, setStatus, resolveFlag, legalReview, remove, adminDetail, addVariant, updateVariant, rescan, nextSku, uniqueSlug, TRACKED };
