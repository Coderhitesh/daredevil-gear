'use strict';

/**
 * Idempotent product import from the business spreadsheet.
 *
 *  - Upsert key: `sourceKey` (normalised source product name). SKUs are assigned once and never change.
 *  - Re-running with an unchanged workbook changes nothing (content hash comparison).
 *  - Fields an admin has edited (product.manuallyEditedFields) are never overwritten.
 *  - Status is only set on creation, except that "(Remove)"/remove-listed items are always archived.
 *  - Stock is only set when a product is first created (live stock is operational data).
 *  - Nothing is deleted; removed products are archived so historical orders stay intact.
 */

const { Product, ProductVariant, Category, Brand, Collection, CatalogBlocklist, InventoryMovement, ImportRun } = require('../../models');
const { parseWorkbook } = require('./product-parser');
const { DEPARTMENTS, COLLECTIONS } = require('./catalog-map');
const { slugify, truncate } = require('../../utils/text');

const IMPORTABLE_FIELDS = ['name', 'description', 'shortDescription', 'features', 'specifications', 'pricing', 'hsnCode', 'packagingCharge', 'weightKg', 'compliance', 'brand', 'category', 'seo', 'variantGroup', 'variantLabel'];

function protectiveWarnings(name) {
  const w = [];
  if (/helmet/i.test(name)) w.push('Not bulletproof. Not for ballistic, fragmentation or life-saving protection.');
  if (/plate carrier/i.test(name)) w.push('Carrier only — plates not included. Provides no ballistic protection.');
  if (/goggles|glasses/i.test(name)) w.push('Impact resistance has not been certified to a ballistic eyewear standard unless a certificate is shown on this page.');
  return w;
}

function computeVariantGroups(records) {
  const groups = new Map();
  for (const r of records) {
    const m = r.name.match(/^(.*?)\s+-\s+(.+)$/);
    if (!m) continue;
    const key = slugify(m[1]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ r, label: m[2] });
  }
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    for (const { r, label } of members) {
      r.variantGroup = key;
      r.variantLabel = label;
    }
  }
}

async function ensureTaxonomy({ dryRun } = {}) {
  const map = {};
  for (const d of DEPARTMENTS) {
    let cat = await Category.findOne({ slug: d.slug });
    if (!cat && !dryRun) {
      cat = await Category.create({ name: d.name, slug: d.slug, description: d.description, sortOrder: d.sortOrder, isActive: true, showInNav: true, isFeatured: d.sortOrder <= 6, seo: { title: `${d.name} | DareDevil Gears`, description: truncate(d.description, 160) } });
    }
    map[d.code] = cat;
  }
  const collections = {};
  for (const c of COLLECTIONS) {
    let col = await Collection.findOne({ slug: c.slug });
    if (!col && !dryRun) col = await Collection.create({ name: c.name, slug: c.slug, description: c.description, isActive: true });
    collections[c.source] = col;
  }
  return { categories: map, collections };
}

async function ensureBrand(b, dryRun) {
  if (!b) return null;
  let brand = await Brand.findOne({ slug: b.slug });
  if (!brand && !dryRun) brand = await Brand.create({ name: b.name, slug: b.slug, isOwnBrand: b.isOwnBrand });
  return brand;
}

async function nextSkuNumber(code, cache) {
  if (cache[code] === undefined) {
    const last = await ProductVariant.find({ sku: new RegExp(`^DDG-${code}-\\d{3,}$`) }).select('sku').lean();
    cache[code] = last.reduce((max, v) => Math.max(max, parseInt(v.sku.split('-')[2], 10) || 0), 0);
  }
  cache[code] += 1;
  return `DDG-${code}-${String(cache[code]).padStart(3, '0')}`;
}

async function uniqueSlug(base, excludeId) {
  let slug = base;
  for (let i = 2; await Product.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }); i++) slug = `${base}-${i}`;
  return slug;
}

function toProductDoc(r, { category, brand }) {
  return {
    name: r.name,
    description: r.description,
    shortDescription: r.shortDescription,
    features: r.features,
    specifications: r.specifications,
    pricing: { ...r.pricing },
    hsnCode: r.hsnCode,
    packagingCharge: r.packagingCharge,
    weightKg: r.weightKg,
    brand: brand?._id || null,
    category: category._id,
    categoryPath: [category._id],
    variantGroup: r.variantGroup,
    variantLabel: r.variantLabel,
    tags: [...new Set([r.department.name, r.sourceCategory].filter(Boolean).flatMap((t) => t.toLowerCase().split(/\s*&\s*|\s+/)).filter((t) => t.length > 2))],
    compliance: {
      netQuantity: r.netQuantity || undefined,
      minAge: r.restrictions.minAge || 0,
      domesticOnly: r.restrictions.domesticOnly,
      dangerousGoods: r.restrictions.dangerousGoods,
      returnable: r.restrictions.returnable !== false && !/engine oil|motor oil|gear oil|coolant|additive/i.test(r.name),
      returnWindowDays: 7,
      warnings: [
        ...protectiveWarnings(r.name),
        ...(r.restrictions.minAge ? ['Sold to adults (18+) only. Delivery within India only.'] : []),
      ],
      legalReview: r.restrictions.legalReview ? { required: true, status: 'pending', notes: r.statusReasons.join('; ') } : { required: false, status: 'not_required' },
    },
    seo: {
      title: truncate(`${r.name} | DareDevil Gears`, 70),
      description: truncate((r.description || r.features.join('. ')).replace(/\s+/g, ' '), 160),
    },
  };
}

async function importProducts({ file, buffer, dryRun = false, actor = null, devStock = null, onProgress } = {}) {
  const { records, blocklists, report } = await parseWorkbook(buffer || file);
  computeVariantGroups(records);

  const summary = {
    dryRun,
    totalSourceRows: report.totals.sourceRows,
    validRecords: records.filter((r) => !r.issues.some((i) => i.level === 'error')).length,
    created: 0,
    updated: 0,
    unchanged: 0,
    archived: 0,
    skipped: report.skipped.length,
    duplicates: report.duplicates.length,
    missingImages: 0,
    missingSkus: 0,
    invalidPrices: 0,
    gstInconsistencies: report.gstInconsistencies.length + report.reconciliation.filter((x) => x.ok === false && x.diff !== null).length,
    visibilityConflicts: report.visibilityConflicts.length,
    needsReview: 0,
  };
  const productReport = [];
  const { categories, collections } = await ensureTaxonomy({ dryRun });
  const skuCache = {};

  for (const r of records) {
    const brand = await ensureBrand(r.brand, dryRun);
    const category = categories[r.department.code];
    const existing = await Product.findOne({ sourceKey: r.sourceKey }).select('+source.raw');
    let action;
    let sku;

    if (r.issues.some((i) => i.message.startsWith('Invalid or missing price'))) summary.invalidPrices += 1;
    if (!r.image) summary.missingImages += 1;

    if (!existing) {
      action = 'create';
      sku = await nextSkuNumber(r.department.code, skuCache);
      if (!dryRun) {
        const doc = toProductDoc(r, { category, brand });
        const product = await Product.create({
          ...doc,
          slug: await uniqueSlug(r.slug),
          sourceKey: r.sourceKey,
          sku,
          availableQty: 0,
          status: r.status,
          publishedAt: r.status === 'published' ? new Date() : undefined,
          archivedAt: r.status === 'archived' ? new Date() : undefined,
          statusHistory: [{ from: null, to: r.status, by: actor, note: `Imported. ${r.statusReasons.join('; ')}`.trim() }],
          flags: r.flags,
          images: r.image && /^https?:\/\//.test(r.image) ? [{ url: r.image, alt: r.name }] : [],
          source: { sheet: r.source.sheet, row: r.source.row, importedAt: new Date(), hash: r.hash, sourceCategory: r.sourceCategory, raw: r.raw },
          createdBy: actor,
        });
        const initialStock = r.stock ?? (devStock && process.env.NODE_ENV !== 'production' ? devStock : 0);
        const variant = await ProductVariant.create({ product: product._id, sku, title: 'Default', isDefault: true, stock: initialStock, available: initialStock, reserved: 0, weightKg: r.weightKg });
        if (initialStock > 0) await Product.updateOne({ _id: product._id }, { $set: { availableQty: initialStock, stockStatus: 'in_stock' } });
        if (initialStock > 0) {
          await InventoryMovement.create({ variant: variant._id, product: product._id, sku, type: 'import', quantity: initialStock, stockAfter: initialStock, availableAfter: initialStock, reason: r.stock != null ? `Opening stock from ${r.source.sheet} row ${r.source.row}` : 'Development stock (--dev-stock)', actor });
        }
        const col = collections[r.sourceCategory];
        if (col) await Collection.updateOne({ _id: col._id }, { $addToSet: { products: product._id } });
      }
      summary.created += 1;
    } else {
      const variant = await ProductVariant.findOne({ product: existing._id, isDefault: true });
      sku = variant?.sku;
      if (!sku) summary.missingSkus += 1;
      const mustArchive = r.status === 'archived' && existing.status !== 'archived';
      if (existing.source?.hash === r.hash && !mustArchive) {
        action = 'unchanged';
        summary.unchanged += 1;
      } else {
        action = 'update';
        if (!dryRun) {
          const doc = toProductDoc(r, { category, brand });
          const locked = new Set(existing.manuallyEditedFields || []);
          for (const field of IMPORTABLE_FIELDS) {
            if (locked.has(field)) continue;
            if (field === 'compliance') {
              // keep admin-entered statutory info; refresh only import-derived restrictions
              const c = existing.compliance?.toObject?.() || {};
              existing.compliance = { ...c, ...doc.compliance, legalReview: c.legalReview?.status && c.legalReview.status !== 'not_required' ? c.legalReview : doc.compliance.legalReview, certificates: c.certificates || [], manufacturer: c.manufacturer, importer: c.importer, packer: c.packer, countryOfOrigin: c.countryOfOrigin, consumerCare: c.consumerCare, netQuantity: c.netQuantity || doc.compliance.netQuantity };
            } else if (field === 'pricing') {
              const sale = existing.pricing?.sale?.toObject ? existing.pricing.sale.toObject() : existing.pricing?.sale;
              existing.pricing = { ...doc.pricing, ...(sale && sale.active !== undefined ? { sale } : {}) };
            } else {
              existing.set(field, doc[field]);
            }
          }
          // merge flags: keep resolved state for codes that still apply
          const resolved = new Map((existing.flags || []).filter((f) => f.resolvedAt).map((f) => [`${f.code}|${f.field}`, f]));
          existing.flags = r.flags.map((f) => resolved.get(`${f.code}|${f.field}`) || f);
          if (mustArchive) {
            existing.statusHistory.push({ from: existing.status, to: 'archived', by: actor, note: `Import: ${r.statusReasons.join('; ')}` });
            existing.status = 'archived';
            existing.archivedAt = new Date();
            summary.archived += 1;
          }
          existing.source = { ...existing.source, sheet: r.source.sheet, row: r.source.row, importedAt: new Date(), hash: r.hash, sourceCategory: r.sourceCategory, raw: r.raw };
          existing.updatedBy = actor;
          if (!existing.sku && sku) existing.sku = sku;
          await existing.save();
          if (variant && r.stock != null && variant.stock !== r.stock) {
            r.issues.push({ level: 'info', message: `Source stock ${r.stock} differs from live stock ${variant.stock} — live stock kept (adjust in Inventory if needed)` });
          }
        }
        summary.updated += 1;
      }
    }
    if (r.status === 'archived' && action === 'create') summary.archived += 1;
    const needsReview = r.status === 'review' || r.flags.some((f) => f.severity === 'blocking') || r.issues.some((i) => i.level === 'conflict' || i.level === 'review');
    if (needsReview) summary.needsReview += 1;

    productReport.push({
      sku,
      name: r.name,
      action,
      status: existing ? existing.status : r.status,
      importStatus: r.status,
      department: r.department.name,
      sourceCategory: r.sourceCategory,
      source: `${r.source.sheet}!${r.source.row}`,
      priceInclusive: r.pricing.priceInclusive / 100,
      gstRate: r.pricing.gstRate,
      gstRule: r.pricing.gstRule,
      hsn: r.hsnCode,
      packaging: r.packagingCharge / 100,
      stock: r.stock,
      statusReasons: r.statusReasons,
      blockingFlags: r.flags.filter((f) => f.severity === 'blocking').map((f) => ({ code: f.code, message: f.message, evidence: f.evidence })),
      warnings: r.flags.filter((f) => f.severity === 'warning').map((f) => ({ code: f.code, message: f.message })),
      issues: r.issues,
      needsReview,
    });
    if (onProgress) onProgress(productReport[productReport.length - 1]);
  }

  if (!dryRun) {
    for (const b of blocklists) {
      await CatalogBlocklist.updateOne({ key: b.key, list: b.list }, { $set: { name: b.name, reason: b.reason, source: 'Remove Product sheet' } }, { upsert: true });
    }
    // refresh category product counts
    for (const cat of Object.values(categories)) {
      if (!cat) continue;
      const count = await Product.countDocuments({ category: cat._id, status: 'published' });
      await Category.updateOne({ _id: cat._id }, { $set: { productCount: count } });
    }
  }

  const fullReport = { summary, products: productReport, ...report };
  if (!dryRun) await ImportRun.create({ kind: 'products', dryRun, sourceFile: file ? String(file).split('/').pop() : 'upload', startedBy: actor, summary, report: fullReport });
  return fullReport;
}

module.exports = { importProducts, ensureTaxonomy, computeVariantGroups };
