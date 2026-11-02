'use strict';

/**
 * Parses the DareDevil Gears product workbook into normalised product records plus a
 * row-level validation report. No database access here — see product-importer.js.
 */

const { locateColumns, readWorkbook } = require('./excel-reader');
const { departmentFor, brandFor, normaliseSourceCategory } = require('./catalog-map');
const { classifySpec, scanProduct } = require('../compliance.service');
const { reconcile } = require('../pricing.service');
const { toPaise } = require('../../utils/money');
const { clean, nameKey, slugify, truncate } = require('../../utils/text');
const { sha256 } = require('../../utils/crypto');

const has = (...words) => (h) => words.every((w) => h.includes(w));

const SHEET_SPECS = {
  products: {
    match: /^products$/i,
    columns: {
      sno: has('s no'),
      opt_photo: has('photo'),
      category: has('product categories'),
      name: has('article name'),
      opt_description: has('product description'),
      opt_specs: has('features'),
      base: (h, sub) => h.includes('website price') && sub.includes('base'),
      inclusive: (h, sub) => h.includes('website price') && sub.includes('incl'),
      gst: has('gst %'),
    },
  },
  oils: {
    match: /engine\s*oil/i,
    columns: {
      sno: has('sr no'),
      name: has('product name'),
      opt_stock: has('stock qty'),
      opt_pack: has('pack size'),
      opt_photo: has('product image'),
      opt_specs: has('specification'),
      opt_features: has('key features'),
      base: has('base price'),
      gst: has('gst %'),
      inclusive: has('price incl'),
      opt_notes: has('review notes'),
    },
  },
  pricing: {
    match: /all product/i,
    columns: {
      sno: (h) => h === 'sno' || h === 's no' || h === 'sr no',
      category: has('product categories'),
      name: has('article name'),
      base: has('base price'),
      gst: (h) => h === 'gst %',
      inclusive: has('website price incl'),
      opt_packaging: has('packaging cost'),
      opt_weight: has('chargeable weight'),
      opt_zone: has('delivery zone'),
      opt_hsn: has('hsn'),
      opt_rule: has('gst rule'),
      opt_fixed: has('fixed gst'),
    },
  },
};

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object') return null; // formula error
  const n = Number(String(v).replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function isError(v) {
  return v && typeof v === 'object' && v.error;
}

function text(v) {
  if (v === null || v === undefined || isError(v)) return '';
  return clean(String(v));
}

/** Split free text that uses double spaces / newlines as separators. */
function splitLines(raw) {
  return String(raw || '')
    .replace(/\r/g, '')
    .split(/\n|\s{2,}|(?=✔)/)
    .map((s) => s.replace(/^(?:\s|✔\uFE0F?|•|-|–)+/u, '').trim())
    .filter(Boolean);
}

/** Turn "Label: value" lines into specifications; other lines become feature bullets. */
function parseSpecs(raw, { featuresOnly = false } = {}) {
  const specifications = [];
  const features = [];
  for (const line of splitLines(raw)) {
    const m = !featuresOnly && line.match(/^([^:]{2,45}):\s*(.+)$/);
    if (m && !/^\d/.test(m[1])) {
      const spec = { label: clean(m[1]).replace(/^\d+\.\s*/, ''), value: clean(m[2]) };
      Object.assign(spec, classifySpec(spec));
      specifications.push(spec);
    } else {
      features.push(line.replace(/^\d+\.\s*/, ''));
    }
  }
  return { specifications, features };
}

function descriptionText(raw) {
  return String(raw || '')
    .replace(/\r/g, '')
    .split(/\n|\s{2,}/)
    .map((s) => clean(s))
    .filter(Boolean)
    .join('\n\n');
}

function displayName(raw) {
  return clean(raw).replace(/\s*\(remove\)\s*/i, '').replace(/\s{2,}/g, ' ').trim();
}

function parseSheetRows(sheet, specKey, report) {
  const spec = SHEET_SPECS[specKey];
  const located = locateColumns(sheet, spec.columns);
  if (!located) {
    report.errors.push({ sheet: sheet.name, row: null, message: `Could not find the expected header row in sheet "${sheet.name}"` });
    return [];
  }
  const { columns, headerRow } = located;
  const out = [];
  for (const row of sheet.rows) {
    if (row.rowNumber <= headerRow) continue;
    report.totals.sourceRows += 1;
    const c = (f) => (columns[f] ? row.cells[columns[f]] : undefined);
    const name = text(c('name'));
    const base = num(c('base'));
    if (!name) {
      report.skipped.push({ sheet: sheet.name, row: row.rowNumber, reason: 'No product name (sub-header or blank row)' });
      continue;
    }
    if (base === null && num(c('inclusive')) === null) {
      report.skipped.push({ sheet: sheet.name, row: row.rowNumber, name, reason: 'No price — treated as non-product row' });
      continue;
    }
    out.push({
      sheet: sheet.name,
      row: row.rowNumber,
      sno: text(c('sno')),
      rawName: name,
      name: displayName(name),
      key: nameKey(name),
      markedRemove: /\(remove\)/i.test(name),
      sourceCategory: normaliseSourceCategory(text(c('category'))),
      description: descriptionText(c('opt_description')),
      specsRaw: text(c('opt_specs')) ? String(c('opt_specs')) : '',
      featuresRaw: c('opt_features') ? String(c('opt_features')) : '',
      photo: text(c('opt_photo')),
      basePrice: base,
      gst: num(c('gst')),
      gstError: isError(c('gst')) ? c('gst').error : null,
      inclusive: num(c('inclusive')),
      inclusiveError: isError(c('inclusive')) ? c('inclusive').error : null,
      stock: num(c('opt_stock')),
      packSize: text(c('opt_pack')),
      notes: text(c('opt_notes')),
      packaging: num(c('opt_packaging')),
      weight: num(c('opt_weight')),
      weightError: isError(c('opt_weight')) ? c('opt_weight').error : null,
      zone: text(c('opt_zone')),
      hsn: text(c('opt_hsn')),
      gstRule: text(c('opt_rule')),
      fixedGst: num(c('opt_fixed')),
    });
  }
  return out;
}

function parseBlocklists(sheet) {
  const lists = [];
  const header = sheet.rows[0];
  if (!header) return lists;
  const cols = [];
  for (const [col, val] of Object.entries(header.cells)) {
    const h = String(val).toLowerCase();
    if (h.includes('hide list')) cols.push({ col: Number(col), list: 'hide' });
    else if (h.includes('remove list from website dare')) cols.push({ col: Number(col), list: 'remove' });
    else if (h.includes('remove list from website')) cols.push({ col: Number(col), list: 'remove_page' });
  }
  for (const row of sheet.rows.slice(1)) {
    for (const { col, list } of cols) {
      const raw = text(row.cells[col]);
      if (!raw) continue;
      const reason = (raw.match(/\(([^)]*removed[^)]*)\)/i) || [])[1] || null;
      const name = clean(raw.replace(/\([^)]*removed[^)]*\)/i, ''));
      lists.push({ name, key: nameKey(name), list, reason, row: row.rowNumber });
    }
  }
  return lists;
}

/**
 * Merge rows from the three sheets into one record per product key.
 * Products sheet + Engine Oil sheet supply content; "All Product" supplies packaging, HSN and GST rule.
 */
function mergeRecords(rowsBySheet, report) {
  const byKey = new Map();
  const order = [];
  const add = (r, role) => {
    if (!byKey.has(r.key)) {
      byKey.set(r.key, { key: r.key, content: null, pricing: null, rows: [] });
      order.push(r.key);
    }
    const rec = byKey.get(r.key);
    rec.rows.push({ sheet: r.sheet, row: r.row });
    if (role === 'content') {
      if (rec.content) report.duplicates.push({ key: r.key, name: r.name, rows: [`${rec.content.sheet}!${rec.content.row}`, `${r.sheet}!${r.row}`], resolution: 'First row used; later row ignored' });
      else rec.content = r;
    } else if (rec.pricing) {
      report.duplicates.push({ key: r.key, name: r.name, rows: [`${rec.pricing.sheet}!${rec.pricing.row}`, `${r.sheet}!${r.row}`], resolution: 'First pricing row used' });
    } else rec.pricing = r;
  };
  for (const r of rowsBySheet.products) add(r, 'content');
  for (const r of rowsBySheet.oils) add(r, 'content');
  for (const r of rowsBySheet.pricing) add(r, 'pricing');
  return order.map((k) => byKey.get(k));
}

function buildRecord(rec, blocklists, report) {
  const c = rec.content;
  const p = rec.pricing;
  const primary = c || p;
  const issues = [];
  const flags = [];

  if (!c) issues.push({ level: 'review', message: 'Only present in the pricing sheet — no description or specifications supplied' });
  if (!p) issues.push({ level: 'info', message: 'Not present in the "Dare Devil All Product" sheet — packaging cost, HSN and GST rule unavailable' });

  // ---- conflict checks between sheets
  if (c && p) {
    for (const [field, label] of [['basePrice', 'Base price'], ['gst', 'GST %'], ['inclusive', 'Price incl. GST']]) {
      if (c[field] !== null && p[field] !== null && Math.abs(c[field] - p[field]) > 0.01) {
        issues.push({ level: 'conflict', message: `${label} differs between sheets: ${c.sheet}=${c[field]} vs ${p.sheet}=${p[field]}` });
        report.conflicts.push({ name: primary.name, field: label, values: { [c.sheet]: c[field], [p.sheet]: p[field] } });
      }
    }
    if (c.sourceCategory && p.sourceCategory && c.sourceCategory !== p.sourceCategory) {
      issues.push({ level: 'conflict', message: `Category differs: ${c.sourceCategory} vs ${p.sourceCategory}` });
      report.conflicts.push({ name: primary.name, field: 'Category', values: { [c.sheet]: c.sourceCategory, [p.sheet]: p.sourceCategory } });
    }
  }

  const base = c?.basePrice ?? p?.basePrice;
  const gst = c?.gst ?? p?.gst ?? p?.fixedGst;
  const inclusive = c?.inclusive ?? p?.inclusive ?? (base != null && gst != null ? Math.round(base * (100 + gst)) / 100 : null);

  // ---- price validation & reconciliation
  const basePaise = toPaise(base);
  const inclPaise = toPaise(inclusive);
  if (!(basePaise > 0) && !(inclPaise > 0)) issues.push({ level: 'error', message: 'Invalid or missing price' });
  if (gst === null || ![0, 5, 12, 18, 28, 40].includes(gst)) issues.push({ level: 'error', message: `Invalid GST rate: ${gst}` });
  const rec1 = reconcile({ basePaise, gstRate: gst, inclusivePaise: inclPaise });
  report.reconciliation.push({ name: primary.name, sheet: primary.sheet, row: primary.row, base, gst, inclusive, expected: rec1.expected != null ? rec1.expected / 100 : null, diff: rec1.diff != null ? rec1.diff / 100 : null, ok: rec1.ok });
  if (!rec1.ok && rec1.reason !== 'missing_values') {
    issues.push({ level: 'conflict', message: `Inclusive price ${inclusive} does not equal base ${base} × (1 + ${gst}%) = ${rec1.expected / 100}` });
  }

  // GST rule (apparel/footwear threshold, ≤ ₹2,500 per piece ex-GST → 5%, else 18%)
  const ruleRaw = (p?.gstRule || '').toLowerCase();
  const gstRule = ruleRaw === 'apparel' || ruleRaw === 'footwear' ? 'apparel_threshold' : 'fixed';
  if (gstRule === 'apparel_threshold' && base != null) {
    const expectedRate = base <= 2500 ? 5 : 18;
    if (expectedRate !== gst) {
      issues.push({ level: 'conflict', message: `GST rule "${p.gstRule}" implies ${expectedRate}% at base ₹${base}, but sheet states ${gst}%` });
      report.gstInconsistencies.push({ name: primary.name, rule: p.gstRule, base, stated: gst, expected: expectedRate });
    }
  }
  if (p?.gstRule === 'Fixed' && p.fixedGst != null && gst != null && p.fixedGst !== gst) {
    report.gstInconsistencies.push({ name: primary.name, rule: 'Fixed', stated: gst, expected: p.fixedGst });
  }

  // ---- content
  const specsParsed = parseSpecs(c?.specsRaw || '');
  const featuresParsed = c?.featuresRaw ? parseSpecs(c.featuresRaw, { featuresOnly: true }) : { features: [], specifications: [] };
  const specifications = specsParsed.specifications;
  const features = [...specsParsed.features, ...featuresParsed.features].map((f) => truncate(f, 600));
  const description = c?.description || '';

  const dept = departmentFor({ name: primary.name, sourceCategory: c?.sourceCategory || p?.sourceCategory, sheet: primary.sheet });
  const brand = brandFor(primary.name);

  // ---- review notes from the oil sheet
  let weightKg = p?.weight ?? null;
  if (c?.notes) {
    const w = c.notes.match(/weight corrected to\s*([\d.]+)\s*kg/i);
    if (w) weightKg = Number(w[1]);
    const priceDoubt = /confirm (grade and )?price|price\b.*confirm/i.test(c.notes);
    flags.push({
      code: priceDoubt ? 'source_price_unconfirmed' : 'source_review_note',
      severity: priceDoubt ? 'blocking' : 'warning',
      message: `Spreadsheet review note: ${c.notes}`,
      field: priceDoubt ? 'pricing' : 'general',
    });
  }
  if (p?.weightError) issues.push({ level: 'info', message: `Chargeable weight is ${p.weightError} in the pricing sheet — shipping uses the fallback weight` });
  if (/harpy/i.test(c?.specsRaw || '') && /flemex|harpy/i.test(c?.notes || '')) {
    flags.push({ code: 'brand_unconfirmed', severity: 'warning', message: 'Brand name conflict (HARPY vs Flemex) — use one brand name', field: 'brand' });
  }
  if (primary.sheet === 'Engine OIl' && !brand) {
    flags.push({ code: 'brand_unconfirmed', severity: 'warning', message: 'Brand not stated in the product name. The fix plan refers to the Flemex range — confirm before assigning.', field: 'brand' });
  }

  const draft = {
    name: primary.name,
    description,
    shortDescription: description ? truncate(description.split('\n')[0], 220) : '',
    features,
    specifications,
  };
  const scan = scanProduct(draft);
  flags.push(...scan.flags);

  // ---- visibility decision
  const block = blocklists.find((b) => (b.list === 'remove' || b.list === 'hide') && b.key === rec.key);
  const fuzzy = blocklists.filter((b) => b.list !== 'remove_page' && b.key !== rec.key && b.key.length > 4 && (rec.key.includes(b.key) || b.key.includes(rec.key)));
  for (const f of fuzzy) report.visibilityConflicts.push({ name: primary.name, list: f.list, listEntry: f.name, resolution: 'Not applied automatically — confirm whether this list entry refers to this product' });

  let status = 'published';
  const reasons = [];
  if (c?.markedRemove || p?.markedRemove) {
    status = 'archived';
    reasons.push('Marked "(Remove)" in the source spreadsheet');
  }
  if (block?.list === 'remove') {
    status = 'archived';
    reasons.push(`On the "Remove" list${block.reason ? ` (${block.reason})` : ''}`);
  } else if (block?.list === 'hide' && status !== 'archived') {
    status = 'draft';
    reasons.push('On the "Hide" list');
  }
  const blocking = flags.filter((f) => f.severity === 'blocking');
  if (status === 'published' && (blocking.length || scan.restrictions.legalReview)) {
    status = 'review';
    reasons.push(...blocking.map((f) => f.message));
  }
  if (status === 'published' && issues.some((i) => i.level === 'review')) {
    status = 'review';
    reasons.push('Product content missing in the source data');
  }
  if (status === 'published' && issues.some((i) => i.level === 'error')) {
    status = 'draft';
    reasons.push('Validation errors');
  }

  const stock = c?.stock != null ? Math.max(0, Math.floor(c.stock)) : null;
  if (stock === null) flags.push({ code: 'stock_missing', severity: 'warning', message: 'No stock quantity supplied — set stock in Inventory before launch', field: 'stock' });
  if (!c?.photo) flags.push({ code: 'image_missing', severity: 'warning', message: 'No product image supplied', field: 'images' });

  const record = {
    sourceKey: rec.key,
    name: primary.name,
    slug: slugify(primary.name),
    department: dept,
    brand,
    sourceCategory: c?.sourceCategory || p?.sourceCategory || '',
    description,
    shortDescription: draft.shortDescription,
    features,
    specifications,
    pricing: {
      priceInclusive: inclPaise,
      gstRate: gst,
      gstRule,
      sourceBasePrice: basePaise,
    },
    hsnCode: p?.hsn || '',
    packagingCharge: toPaise(p?.packaging) || 0,
    weightKg: weightKg ?? undefined,
    netQuantity: c?.packSize ? c.packSize.replace(/\bML\b/, 'ml').replace(/\bLITER\b/i, 'litre') : '',
    stock,
    image: c?.photo || '',
    restrictions: scan.restrictions,
    flags,
    status,
    statusReasons: reasons,
    issues,
    source: { sheet: primary.sheet, row: primary.row, rows: rec.rows, sourceCategory: c?.sourceCategory || p?.sourceCategory },
    raw: { content: c, pricing: p },
  };
  record.hash = sha256(JSON.stringify({ ...record, raw: undefined, issues: undefined }));
  return record;
}

async function parseWorkbook(fileOrBuffer) {
  const sheets = await readWorkbook(fileOrBuffer);
  const report = {
    generatedAt: new Date().toISOString(),
    sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.length, state: s.state })),
    totals: { sourceRows: 0 },
    skipped: [],
    errors: [],
    duplicates: [],
    conflicts: [],
    reconciliation: [],
    gstInconsistencies: [],
    visibilityConflicts: [],
  };
  const rowsBySheet = { products: [], oils: [], pricing: [] };
  let blocklists = [];
  for (const sheet of sheets) {
    if (SHEET_SPECS.products.match.test(sheet.name.trim())) rowsBySheet.products = parseSheetRows(sheet, 'products', report);
    else if (SHEET_SPECS.oils.match.test(sheet.name)) rowsBySheet.oils = parseSheetRows(sheet, 'oils', report);
    else if (SHEET_SPECS.pricing.match.test(sheet.name)) rowsBySheet.pricing = parseSheetRows(sheet, 'pricing', report);
    else if (/remove/i.test(sheet.name)) blocklists = parseBlocklists(sheet);
    else report.errors.push({ sheet: sheet.name, message: 'Unrecognised sheet — not imported' });
  }

  // within-sheet duplicates
  for (const [sheetKey, rows] of Object.entries(rowsBySheet)) {
    const seen = new Map();
    for (const r of rows) {
      if (seen.has(r.key)) report.duplicates.push({ key: r.key, name: r.name, rows: [`${r.sheet}!${seen.get(r.key)}`, `${r.sheet}!${r.row}`], resolution: `Duplicate within ${sheetKey} sheet` });
      else seen.set(r.key, r.row);
    }
  }
  // duplicated entries inside the hide/remove lists
  const blSeen = new Set();
  for (const b of blocklists) {
    const k = `${b.list}|${b.key}`;
    if (blSeen.has(k)) report.duplicates.push({ key: b.key, name: b.name, rows: [`Remove Product!${b.row}`], resolution: `Repeated entry in ${b.list} list (ignored)` });
    blSeen.add(k);
  }

  const merged = mergeRecords(rowsBySheet, report);
  const records = merged.map((m) => buildRecord(m, blocklists, report));

  // list entries that match no product in the workbook (refer to old website items)
  const keys = new Set(records.map((r) => r.sourceKey));
  report.blocklistOnly = blocklists.filter((b) => !keys.has(b.key)).map((b) => ({ name: b.name, list: b.list, reason: b.reason }));

  return { records, blocklists, report };
}

module.exports = { parseWorkbook, parseSpecs, splitLines, descriptionText, displayName };
