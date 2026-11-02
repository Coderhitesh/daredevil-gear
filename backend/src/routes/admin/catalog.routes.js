'use strict';

const router = require('express').Router();
const path = require('path');
const { asyncHandler: h, ok, ApiError, parsePagination, pageMeta } = require('../../utils/http');
const { validate } = require('../../middleware/validate');
const { requirePermission, requireAnyPermission } = require('../../middleware/auth');
const { audit } = require('../../services/audit.service');
const { Product, ProductVariant, Category, Collection, Brand, InventoryMovement, ImportRun, CatalogBlocklist } = require('../../models');
const adminProducts = require('../../services/admin-product.service');
const inventory = require('../../services/inventory.service');
const catalog = require('../../services/catalog.service');
const compliance = require('../../services/compliance.service');
const upload = require('../../services/upload.service');
const { importProducts } = require('../../services/import/product-importer');
const { markdown } = require('../../services/import/report-writer');
const { toCsv } = require('../../services/report.service');
const { escapeRegex, slugify } = require('../../utils/text');
const { crud } = require('./crud');
const { z, objectId, paise, slug, safeText } = require('../../validators/schemas');

const idParams = z.object({ id: objectId });
const spec = z.object({ label: z.string().trim().min(1).max(120), value: z.string().trim().min(1).max(1000), isPublic: z.boolean().optional() });
const imageSchema = z.object({ url: z.string().url(), publicId: z.string().optional(), alt: z.string().max(160).optional(), width: z.number().optional(), height: z.number().optional(), sortOrder: z.number().int().optional() });
const party = z.object({ name: safeText(200).optional(), address: safeText(500).optional() });

const productBody = z.object({
  name: z.string().trim().min(3).max(200),
  slug: slug.optional(),
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,40}$/).optional(),
  category: objectId,
  brand: objectId.nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(30).optional(),
  variantGroup: z.string().max(120).optional(),
  variantLabel: z.string().max(80).optional(),
  shortDescription: safeText(500).optional(),
  description: safeText(20000).optional(),
  features: z.array(z.string().trim().max(600)).max(40).optional(),
  specifications: z.array(spec).max(60).optional(),
  videos: z.array(z.object({ url: z.string().url(), provider: z.string().max(30).optional(), title: z.string().max(120).optional() })).max(10).optional(),
  pricing: z
    .object({
      priceInclusive: paise.refine((v) => v > 0, 'Price must be greater than zero'),
      gstRule: z.enum(['fixed', 'apparel_threshold']).default('fixed'),
      gstRate: z.coerce.number().refine((v) => [0, 5, 12, 18, 28, 40].includes(v), 'Invalid GST rate'),
      sale: z
        .object({
          active: z.boolean(),
          priceInclusive: paise.optional(),
          startsAt: z.coerce.date().optional().nullable(),
          endsAt: z.coerce.date().optional().nullable(),
          reason: safeText(200).optional(),
          referencePriceEvidence: safeText(500).optional(),
        })
        .optional(),
    })
    .optional(),
  hsnCode: z.string().trim().regex(/^\d{4,8}$/, 'HSN must be 4–8 digits').optional().or(z.literal('')),
  hsnVerified: z.boolean().optional(),
  packagingCharge: paise.optional(),
  weightKg: z.coerce.number().min(0).max(500).optional(),
  dimensionsCm: z.object({ l: z.number().optional(), w: z.number().optional(), h: z.number().optional() }).optional(),
  isFeatured: z.boolean().optional(),
  seo: z.object({ title: safeText(70).optional(), description: safeText(170).optional(), canonical: z.string().url().optional().or(z.literal('')), noindex: z.boolean().optional() }).optional(),
  compliance: z
    .object({
      countryOfOrigin: safeText(80).optional(),
      manufacturer: party.optional(),
      importer: party.optional(),
      packer: party.optional(),
      netQuantity: safeText(80).optional(),
      consumerCare: safeText(300).optional(),
      safetyInstructions: safeText(3000).optional(),
      warnings: z.array(safeText(300)).max(10).optional(),
      certificates: z.array(z.object({ name: safeText(120), standard: safeText(120).optional(), fileUrl: z.string().url().optional(), issuedBy: safeText(120).optional(), verified: z.boolean().optional() })).max(10).optional(),
      minAge: z.number().int().min(0).max(21).optional(),
      domesticOnly: z.boolean().optional(),
      allowedCountries: z.array(z.string().length(2)).optional(),
      blockedStates: z.array(z.string().max(80)).optional(),
      dangerousGoods: z.boolean().optional(),
      returnable: z.boolean().optional(),
      returnWindowDays: z.number().int().min(0).max(60).optional(),
    })
    .optional(),
  initialStock: z.coerce.number().int().min(0).max(100000).optional(),
});

// ---------------- products ----------------

router.get(
  '/products',
  requirePermission('products:read'),
  h(async (req, res) => {
    const pg = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.category && /^[a-f\d]{24}$/i.test(req.query.category)) filter.category = req.query.category;
    if (req.query.stock === 'out') filter.stockStatus = 'out_of_stock';
    if (req.query.flags === 'blocking') filter.flags = { $elemMatch: { severity: 'blocking', resolvedAt: null } };
    if (req.query.q) {
      const rx = { $regex: escapeRegex(String(req.query.q).slice(0, 80)), $options: 'i' };
      filter.$or = [{ name: rx }, { sku: rx }, { slug: rx }];
    }
    const sort = { updated: { updatedAt: -1 }, name: { name: 1 }, price: { 'pricing.priceInclusive': 1 }, stock: { availableQty: 1 } }[req.query.sort] || { updatedAt: -1 };
    const [items, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(pg.skip).limit(pg.limit).populate('category', 'name slug').select('name slug sku status pricing images category availableQty stockStatus flags updatedAt salesCount ratings').lean(),
      Product.countDocuments(filter),
    ]);
    return ok(
      res,
      items.map((p) => ({
        ...p,
        image: p.images?.[0]?.url || null,
        images: undefined,
        blockingFlags: (p.flags || []).filter((f) => f.severity === 'blocking' && !f.resolvedAt).length,
        warningFlags: (p.flags || []).filter((f) => f.severity === 'warning' && !f.resolvedAt).length,
        flags: undefined,
      })),
      pageMeta(pg, total)
    );
  })
);

router.get(
  '/products/summary',
  requirePermission('products:read'),
  h(async (_req, res) => {
    const all = await Product.find().select('status stockStatus flags compliance hsnCode images').lean();
    const count = (fn) => all.filter(fn).length;
    return ok(res, {
      total: all.length,
      byStatus: ['draft', 'review', 'published', 'archived'].reduce((o, s) => ({ ...o, [s]: count((p) => p.status === s) }), {}),
      outOfStock: count((p) => p.status === 'published' && p.stockStatus === 'out_of_stock'),
      blocking: count((p) => (p.flags || []).some((f) => f.severity === 'blocking' && !f.resolvedAt)),
      missingImages: count((p) => p.status !== 'archived' && !p.images?.length),
      missingStatutory: count((p) => p.status !== 'archived' && compliance.statutoryWarnings(p).length > 0),
    });
  })
);

router.get('/products/export', requirePermission('products:read'), h(async (_req, res) => {
  const products = await Product.find().populate('category', 'name').lean();
  const variants = await ProductVariant.find().lean();
  const byProduct = new Map();
  variants.forEach((v) => byProduct.set(String(v.product), [...(byProduct.get(String(v.product)) || []), v]));
  const rows = products.flatMap((p) =>
    (byProduct.get(String(p._id)) || [{}]).map((v) => ({
      sku: v.sku || p.sku,
      name: p.name,
      variant: v.title || '',
      status: p.status,
      category: p.category?.name,
      priceInclusive: ((v.priceInclusive ?? p.pricing.priceInclusive) / 100).toFixed(2),
      gstRule: p.pricing.gstRule,
      gstRate: p.pricing.gstRate,
      hsn: p.hsnCode || '',
      packaging: ((p.packagingCharge || 0) / 100).toFixed(2),
      stock: v.stock ?? '',
      reserved: v.reserved ?? '',
      available: v.available ?? '',
      weightKg: v.weightKg ?? p.weightKg ?? '',
      slug: p.slug,
    }))
  );
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="ddg-products-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(toCsv(rows));
}));

router.post(
  '/products/import',
  requirePermission('products:import'),
  upload.memoryUpload({ maxMb: 10, maxFiles: 1, allowed: upload.XLSX_TYPES }).single('file'),
  h(async (req, res) => {
    upload.assertFile(req.file, upload.XLSX_TYPES);
    const dryRun = req.query.dryRun !== 'false';
    const report = await importProducts({ buffer: req.file.buffer, dryRun, actor: req.admin._id });
    if (!dryRun) {
      await audit(req, { action: 'products.import', entity: 'Product', summary: `Imported ${path.basename(req.file.originalname)}: ${JSON.stringify(report.summary)}` });
      await catalog.refreshCategoryCounts();
    }
    return ok(res, { summary: report.summary, markdown: markdown(report), products: report.products, conflicts: report.conflicts, reconciliation: report.reconciliation.filter((r) => !r.ok), visibilityConflicts: report.visibilityConflicts });
  })
);

router.get('/imports', requirePermission('products:read'), h(async (_req, res) => ok(res, await ImportRun.find().select('kind dryRun sourceFile summary createdAt startedBy').sort({ createdAt: -1 }).limit(50).populate('startedBy', 'name email').lean())));
router.get('/imports/:id', requirePermission('products:read'), validate({ params: idParams }), h(async (req, res) => {
  const run = await ImportRun.findById(req.params.id).lean();
  if (!run) throw ApiError.notFound();
  return ok(res, { ...run, markdown: markdown(run.report) });
}));

router.get('/products/:id', requirePermission('products:read'), validate({ params: idParams }), h(async (req, res) => ok(res, await adminProducts.adminDetail(req.params.id))));

router.get('/products/:id/preview', requirePermission('products:read'), validate({ params: idParams }), h(async (req, res) => {
  const p = await Product.findById(req.params.id).lean();
  if (!p) throw ApiError.notFound();
  return ok(res, await catalog.serialiseDetail(p));
}));

router.post(
  '/products',
  requirePermission('products:write'),
  validate({ body: productBody.extend({ pricing: productBody.shape.pricing.unwrap() }) }),
  h(async (req, res) => {
    const { product, warning } = await adminProducts.create(req.body, req.admin);
    await audit(req, { action: 'product.create', entity: 'Product', entityId: product._id, summary: product.name });
    return ok(res, { product, warning }, undefined, 201);
  })
);

router.patch(
  '/products/:id',
  requirePermission('products:write'),
  validate({ params: idParams, body: productBody.partial() }),
  h(async (req, res) => {
    const before = await Product.findById(req.params.id).lean();
    const product = await adminProducts.update(req.params.id, req.body, req.admin);
    await audit(req, { action: 'product.update', entity: 'Product', entityId: product._id, before, after: product.toObject() });
    return ok(res, await adminProducts.adminDetail(product._id));
  })
);

router.post(
  '/products/:id/status',
  requirePermission('products:publish'),
  validate({ params: idParams, body: z.object({ status: z.enum(['draft', 'review', 'published', 'archived']), note: safeText(300).optional() }) }),
  h(async (req, res) => {
    const product = await adminProducts.setStatus(req.params.id, req.body.status, { note: req.body.note, actor: req.admin });
    await audit(req, { action: `product.${req.body.status}`, entity: 'Product', entityId: product._id, summary: `${product.name} → ${req.body.status}` });
    return ok(res, await adminProducts.adminDetail(product._id));
  })
);

router.post(
  '/products/:id/flags/:flagId/resolve',
  requirePermission('products:publish'),
  validate({ params: z.object({ id: objectId, flagId: objectId }), body: z.object({ note: z.string().trim().min(10).max(500) }) }),
  h(async (req, res) => {
    const product = await adminProducts.resolveFlag(req.params.id, req.params.flagId, { note: req.body.note, actor: req.admin });
    await audit(req, { action: 'product.flag_resolved', entity: 'Product', entityId: product._id, summary: req.body.note });
    return ok(res, await adminProducts.adminDetail(product._id));
  })
);

router.post(
  '/products/:id/legal-review',
  requirePermission('products:publish', 'settings:write'),
  validate({ params: idParams, body: z.object({ status: z.enum(['pending', 'approved', 'rejected']), notes: z.string().trim().min(10).max(1000) }) }),
  h(async (req, res) => {
    const product = await adminProducts.legalReview(req.params.id, { ...req.body, actor: req.admin });
    await audit(req, { action: 'product.legal_review', entity: 'Product', entityId: product._id, summary: `${req.body.status}: ${req.body.notes}` });
    return ok(res, await adminProducts.adminDetail(product._id));
  })
);

router.delete('/products/:id', requirePermission('products:write'), validate({ params: idParams }), h(async (req, res) => {
  const result = await adminProducts.remove(req.params.id, req.admin);
  await audit(req, { action: result ? 'product.archive' : 'product.delete', entity: 'Product', entityId: req.params.id });
  return ok(res, { archived: Boolean(result), deleted: !result });
}));

// images
router.post(
  '/products/:id/images',
  requirePermission('products:write'),
  validate({ params: idParams }),
  upload.memoryUpload({ maxMb: 8, maxFiles: 10 }).array('files', 10),
  h(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw ApiError.notFound();
    if (!req.files?.length) throw ApiError.badRequest('No files received');
    for (const f of req.files) {
      const img = await upload.uploadImage(f, { folder: `products/${product.slug}`, publicIdPrefix: product.slug });
      product.images.push({ ...img, alt: product.name, sortOrder: product.images.length });
    }
    adminProducts.rescan(product);
    await product.save();
    await audit(req, { action: 'product.images_added', entity: 'Product', entityId: product._id, summary: `${req.files.length} image(s)` });
    return ok(res, product.images);
  })
);

router.put(
  '/products/:id/images',
  requirePermission('products:write'),
  validate({ params: idParams, body: z.object({ images: z.array(imageSchema).max(20) }) }),
  h(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw ApiError.notFound();
    const keep = new Set(req.body.images.map((i) => i.publicId || i.url));
    const removed = product.images.filter((i) => !keep.has(i.publicId || i.url));
    product.images = req.body.images.map((img, idx) => ({ ...img, sortOrder: idx }));
    adminProducts.rescan(product);
    await product.save();
    for (const r of removed) await upload.destroy(r.publicId);
    return ok(res, product.images);
  })
);

// variants
router.post(
  '/products/:id/variants',
  requirePermission('products:write'),
  validate({ params: idParams, body: z.object({ title: z.string().trim().min(1).max(80), options: z.record(z.string().max(60)).optional(), priceInclusive: paise.optional(), sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,40}$/).optional(), weightKg: z.number().min(0).optional(), initialStock: z.number().int().min(0).optional() }) }),
  h(async (req, res) => {
    const v = await adminProducts.addVariant(req.params.id, req.body, req.admin);
    await audit(req, { action: 'variant.create', entity: 'ProductVariant', entityId: v._id, summary: v.sku });
    return ok(res, v, undefined, 201);
  })
);
router.patch(
  '/products/:id/variants/:variantId',
  requirePermission('products:write'),
  validate({ params: z.object({ id: objectId, variantId: objectId }), body: z.object({ title: z.string().max(80).optional(), options: z.record(z.string().max(60)).optional(), priceInclusive: paise.nullable().optional(), lowStockThreshold: z.number().int().min(0).optional(), isActive: z.boolean().optional(), sortOrder: z.number().int().optional(), weightKg: z.number().min(0).optional(), barcode: z.string().max(40).optional(), trackInventory: z.boolean().optional() }) }),
  h(async (req, res) => {
    const v = await adminProducts.updateVariant(req.params.id, req.params.variantId, req.body);
    await audit(req, { action: 'variant.update', entity: 'ProductVariant', entityId: v._id, summary: v.sku, after: req.body });
    return ok(res, v);
  })
);

// ---------------- inventory ----------------

router.get('/inventory', requirePermission('products:read'), h(async (req, res) => {
  const pg = parsePagination(req.query, { defaultLimit: 100, maxLimit: 500 });
  const filter = {};
  if (req.query.low === 'true') filter.available = { $lte: 5 };
  if (req.query.q) filter.sku = { $regex: escapeRegex(String(req.query.q).toUpperCase()), $options: 'i' };
  const [items, total] = await Promise.all([ProductVariant.find(filter).sort({ available: 1, sku: 1 }).skip(pg.skip).limit(pg.limit).populate('product', 'name slug status').lean(), ProductVariant.countDocuments(filter)]);
  return ok(res, items, pageMeta(pg, total));
}));

router.post(
  '/inventory/:variantId/adjust',
  requirePermission('inventory:write'),
  validate({ params: z.object({ variantId: objectId }), body: z.object({ mode: z.enum(['delta', 'set']).default('delta'), quantity: z.number().int().min(-100000).max(100000), reason: z.string().trim().min(3).max(300), type: z.enum(['adjustment', 'damaged', 'correction']).default('adjustment') }) }),
  h(async (req, res) => {
    const { mode, quantity, reason, type } = req.body;
    const v = mode === 'set' ? await inventory.setStock(req.params.variantId, quantity, { reason, actor: req.admin._id }) : await inventory.adjust(req.params.variantId, quantity, { reason, actor: req.admin._id, type });
    await audit(req, { action: 'inventory.adjust', entity: 'ProductVariant', entityId: v._id, summary: `${v.sku}: ${mode} ${quantity} (${reason}) → stock ${v.stock}` });
    return ok(res, v);
  })
);

router.get('/inventory/movements', requirePermission('products:read'), h(async (req, res) => {
  const pg = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
  const filter = {};
  if (req.query.variant && /^[a-f\d]{24}$/i.test(req.query.variant)) filter.variant = req.query.variant;
  if (req.query.product && /^[a-f\d]{24}$/i.test(req.query.product)) filter.product = req.query.product;
  const [items, total] = await Promise.all([InventoryMovement.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate('actor', 'name').populate('order', 'orderNumber').lean(), InventoryMovement.countDocuments(filter)]);
  return ok(res, items, pageMeta(pg, total));
}));

// ---------------- categories ----------------

const categoryBody = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slug.optional(),
  parent: objectId.nullable().optional(),
  description: safeText(2000).optional(),
  image: imageSchema.nullable().optional(),
  banner: imageSchema.nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  showInNav: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  seo: z.object({ title: safeText(70).optional(), description: safeText(170).optional() }).optional(),
});

async function prepareCategory(data, _req, doc) {
  const out = { ...data };
  if (out.name && !out.slug && !doc) out.slug = slugify(out.name);
  if (out.slug) {
    const clash = await Category.findOne({ slug: out.slug, ...(doc ? { _id: { $ne: doc._id } } : {}) }).lean();
    if (clash) throw ApiError.conflict('Another category already uses this URL slug');
  }
  if (out.parent !== undefined) {
    if (out.parent === null) out.ancestors = [];
    else {
      const parent = await Category.findById(out.parent).lean();
      if (!parent) throw ApiError.badRequest('Parent category not found');
      if (doc && (String(parent._id) === String(doc._id) || (parent.ancestors || []).some((a) => String(a) === String(doc._id)))) {
        throw ApiError.badRequest('A category cannot be placed inside itself or its own sub-category');
      }
      if ((parent.ancestors || []).length >= 2) throw ApiError.badRequest('Categories can be nested at most three levels deep');
      out.ancestors = [...(parent.ancestors || []), parent._id];
    }
  }
  return out;
}

router.use(
  '/categories',
  crud({
    Model: Category,
    schema: categoryBody,
    entity: 'Category',
    read: 'products:read',
    write: 'categories:write',
    sort: { sortOrder: 1, name: 1 },
    beforeSave: prepareCategory,
    afterChange: async () => catalog.refreshCategoryCounts(),
    canDelete: async (doc) => {
      if (await Product.exists({ category: doc._id })) return 'Move or archive the products in this category first (or disable the category instead)';
      if (await Category.exists({ parent: doc._id })) return 'This category has sub-categories';
      return null;
    },
  })
);

router.use(
  '/collections',
  crud({
    Model: Collection,
    schema: z.object({ name: z.string().trim().min(2).max(80), slug, description: safeText(1000).optional(), image: imageSchema.nullable().optional(), products: z.array(objectId).max(200).optional(), isActive: z.boolean().optional(), sortOrder: z.number().int().optional(), seo: z.object({ title: safeText(70).optional(), description: safeText(170).optional() }).optional() }),
    entity: 'Collection',
    read: 'products:read',
    write: 'categories:write',
    sort: { sortOrder: 1 },
  })
);

router.use(
  '/brands',
  crud({
    Model: Brand,
    schema: z.object({ name: z.string().trim().min(2).max(80), slug, isOwnBrand: z.boolean().optional(), authorisedDistributorProof: z.boolean().optional(), isActive: z.boolean().optional(), notes: safeText(500).optional() }),
    entity: 'Brand',
    read: 'products:read',
    write: 'categories:write',
    sort: { name: 1 },
    canDelete: async (doc) => ((await Product.exists({ brand: doc._id })) ? 'Brand is used by products' : null),
  })
);

router.get('/blocklist', requirePermission('products:read'), h(async (_req, res) => ok(res, await CatalogBlocklist.find().sort({ list: 1, name: 1 }).lean())));

router.post('/uploads/image', requireAnyPermission('content:write', 'products:write'), upload.memoryUpload({ maxMb: 8, maxFiles: 1 }).single('file'), h(async (req, res) => ok(res, await upload.uploadImage(req.file, { folder: String(req.query.folder || 'content').replace(/[^a-z0-9-/]/gi, '') }), undefined, 201)));
router.post('/uploads/document', requirePermission('products:write'), upload.memoryUpload({ maxMb: 10, maxFiles: 1, allowed: upload.DOC_TYPES }).single('file'), h(async (req, res) => ok(res, await upload.uploadDocument(req.file, { folder: 'certificates' }), undefined, 201)));

module.exports = router;
