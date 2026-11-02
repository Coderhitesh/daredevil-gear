'use strict';

/**
 * Admin → Shipping data: weight and packed size for every product in one table, so delivery
 * charges (Shiprocket bills the higher of actual and volumetric weight) are right.
 *  - GET    /shipping-data?missing=1&q=      list (missing = weight or size not entered)
 *  - PATCH  /shipping-data/:productId        { weightKg, dimensionsCm: {l,w,h}, variants: [{id, weightKg}] }
 *  - GET    /shipping-data/export            CSV: sku,variant_sku,name,weight_kg,length_cm,width_cm,height_cm
 *  - POST   /shipping-data/import            { csv } same columns; matched by SKU (variant SKU sets that variant's weight)
 */
const router = require('express').Router();
const { asyncHandler: h, ok, ApiError, parsePagination, pageMeta } = require('../../utils/http');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/auth');
const { audit } = require('../../services/audit.service');
const { Product, ProductVariant } = require('../../models');
const { toCsv } = require('../../services/report.service');
const { escapeRegex } = require('../../utils/text');
const { z, objectId } = require('../../validators/schemas');

const num = z.number().min(0).max(500).nullable().optional();
const dims = z.object({ l: num, w: num, h: num }).optional();
const hasDims = (d) => d && d.l > 0 && d.w > 0 && d.h > 0;

async function rows(filter, pg) {
  const [products, total] = await Promise.all([Product.find(filter).sort({ name: 1 }).skip(pg?.skip || 0).limit(pg?.limit || 5000).select('name sku slug status weightKg dimensionsCm category').populate('category', 'name').lean(), Product.countDocuments(filter)]);
  const variants = await ProductVariant.find({ product: { $in: products.map((p) => p._id) } }).select('product sku title weightKg isDefault isActive').sort({ isDefault: -1, sortOrder: 1 }).lean();
  const byProduct = new Map();
  for (const v of variants) {
    const k = String(v.product);
    if (!byProduct.has(k)) byProduct.set(k, []);
    byProduct.get(k).push(v);
  }
  return {
    total,
    items: products.map((p) => ({
      _id: p._id,
      name: p.name,
      sku: p.sku,
      slug: p.slug,
      status: p.status,
      category: p.category?.name || null,
      weightKg: p.weightKg ?? null,
      dimensionsCm: p.dimensionsCm || {},
      complete: p.weightKg > 0 && hasDims(p.dimensionsCm),
      variants: (byProduct.get(String(p._id)) || []).map((v) => ({ id: String(v._id), sku: v.sku, title: v.title, weightKg: v.weightKg ?? null, isDefault: v.isDefault })),
    })),
  };
}

function listFilter(q) {
  const filter = { status: { $ne: 'archived' } };
  if (q.q) filter.$or = [{ name: { $regex: escapeRegex(String(q.q).slice(0, 80)), $options: 'i' } }, { sku: { $regex: escapeRegex(String(q.q).slice(0, 40)), $options: 'i' } }];
  if (q.missing === '1' || q.missing === 'true') {
    filter.$and = [{ $or: [{ weightKg: { $in: [null, 0] } }, { weightKg: { $exists: false } }, { 'dimensionsCm.l': { $in: [null, 0] } }, { 'dimensionsCm.w': { $in: [null, 0] } }, { 'dimensionsCm.h': { $in: [null, 0] } }, { 'dimensionsCm.l': { $exists: false } }] }];
  }
  return filter;
}

router.get(
  '/shipping-data',
  requirePermission('products:read'),
  h(async (req, res) => {
    const pg = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const filter = listFilter(req.query);
    const data = await rows(filter, pg);
    const [all, missing] = await Promise.all([Product.countDocuments({ status: { $ne: 'archived' } }), Product.countDocuments(listFilter({ missing: '1' }))]);
    return ok(res, data.items, { ...pageMeta(pg, data.total), counts: { all, missing } });
  })
);

router.get(
  '/shipping-data/export',
  requirePermission('products:read'),
  h(async (_req, res) => {
    const { items } = await rows(listFilter({}));
    const out = [];
    for (const p of items) {
      out.push({ sku: p.sku, variant_sku: '', name: p.name, weight_kg: p.weightKg ?? '', length_cm: p.dimensionsCm.l ?? '', width_cm: p.dimensionsCm.w ?? '', height_cm: p.dimensionsCm.h ?? '' });
      for (const v of p.variants.filter((x) => !x.isDefault)) out.push({ sku: p.sku, variant_sku: v.sku, name: `${p.name} — ${v.title}`, weight_kg: v.weightKg ?? '', length_cm: '', width_cm: '', height_cm: '' });
    }
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="ddg-shipping-data-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(toCsv(out));
  })
);

async function applyProduct(productId, { weightKg, dimensionsCm, variants = [] }) {
  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');
  const before = { weightKg: product.weightKg, dimensionsCm: product.dimensionsCm ? { ...product.dimensionsCm } : {} };
  if (weightKg !== undefined) {
    product.weightKg = weightKg || undefined;
    // the default option ships with the product weight
    await ProductVariant.updateMany({ product: product._id, isDefault: true }, { $set: { weightKg: weightKg || undefined } });
  }
  if (dimensionsCm) {
    const cur = product.dimensionsCm || {};
    product.dimensionsCm = { l: dimensionsCm.l === undefined ? cur.l : dimensionsCm.l || undefined, w: dimensionsCm.w === undefined ? cur.w : dimensionsCm.w || undefined, h: dimensionsCm.h === undefined ? cur.h : dimensionsCm.h || undefined };
  }
  await product.save();
  for (const v of variants) await ProductVariant.updateOne({ _id: v.id, product: product._id }, { $set: { weightKg: v.weightKg || undefined } });
  return { product, before };
}

router.patch(
  '/shipping-data/:id',
  requirePermission('products:write'),
  validate({ params: z.object({ id: objectId }), body: z.object({ weightKg: num, dimensionsCm: dims, variants: z.array(z.object({ id: objectId, weightKg: num })).max(100).optional() }) }),
  h(async (req, res) => {
    const { product, before } = await applyProduct(req.params.id, req.body);
    await audit(req, { action: 'product.shipping_data', entity: 'Product', entityId: product._id, summary: product.sku, before, after: { weightKg: product.weightKg, dimensionsCm: product.dimensionsCm } });
    const { items } = await rows({ _id: product._id });
    return ok(res, items[0]);
  })
);

/** Minimal CSV parser (quoted fields, commas, CRLF). */
function parseCsv(text) {
  const out = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      out.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    out.push(row);
  }
  return out.filter((r) => r.some((x) => String(x).trim()));
}

router.post(
  '/shipping-data/import',
  requirePermission('products:write'),
  validate({ body: z.object({ csv: z.string().min(5).max(2_000_000) }) }),
  h(async (req, res) => {
    const [head, ...data] = parseCsv(req.body.csv.replace(/^\uFEFF/, ''));
    const cols = (head || []).map((x) => String(x).trim().toLowerCase());
    const at = (name) => cols.indexOf(name);
    if (at('sku') < 0) throw ApiError.badRequest('The first row must have the column names: sku, variant_sku, weight_kg, length_cm, width_cm, height_cm');
    const val = (r, name) => {
      const i = at(name);
      if (i < 0) return undefined;
      const s = String(r[i] ?? '').trim();
      if (s === '') return undefined;
      const n = Number(s);
      return Number.isFinite(n) && n >= 0 && n <= 500 ? n : NaN;
    };
    const result = { updated: 0, variantsUpdated: 0, skipped: [] };
    for (const [k, r] of data.entries()) {
      const line = k + 2;
      const sku = String(r[at('sku')] || '').trim().toUpperCase();
      const vsku = at('variant_sku') >= 0 ? String(r[at('variant_sku')] || '').trim().toUpperCase() : '';
      const w = val(r, 'weight_kg');
      const l = val(r, 'length_cm');
      const wd = val(r, 'width_cm');
      const ht = val(r, 'height_cm');
      if ([w, l, wd, ht].some((x) => Number.isNaN(x))) {
        result.skipped.push({ line, sku, reason: 'Numbers only (0–500)' });
        continue;
      }
      if (vsku) {
        const v = await ProductVariant.findOne({ sku: vsku });
        if (!v) {
          result.skipped.push({ line, sku: vsku, reason: 'Variant SKU not found' });
          continue;
        }
        if (w !== undefined) {
          await ProductVariant.updateOne({ _id: v._id }, { $set: { weightKg: w || undefined } });
          result.variantsUpdated += 1;
        }
        continue;
      }
      const p = await Product.findOne({ sku }).select('_id').lean();
      if (!p) {
        result.skipped.push({ line, sku, reason: 'SKU not found' });
        continue;
      }
      if (w === undefined && l === undefined && wd === undefined && ht === undefined) continue;
      await applyProduct(p._id, { weightKg: w, dimensionsCm: { l, w: wd, h: ht } });
      result.updated += 1;
    }
    await audit(req, { action: 'product.shipping_import', entity: 'Product', summary: `${result.updated} products, ${result.variantsUpdated} variants, ${result.skipped.length} skipped` });
    return ok(res, result);
  })
);

module.exports = router;
