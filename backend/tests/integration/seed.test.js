'use strict';

const path = require('path');
const { setupDb, teardownDb, models } = require('../helpers');
const { importProducts } = require('../../src/services/import/product-importer');

const FILE = path.resolve(__dirname, '../../data/DDG_WEBSITE_PRODUCT_DETAILS_Corrected.xlsx');

beforeAll(async () => setupDb('seed'));
afterAll(teardownDb);

describe('spreadsheet import', () => {
  let first;

  test('dry run changes nothing', async () => {
    const report = await importProducts({ file: FILE, dryRun: true });
    expect(report.summary.created).toBe(report.products.length);
    expect(await models.Product.countDocuments()).toBe(0);
  });

  test('first import creates every product with a unique SKU', async () => {
    first = await importProducts({ file: FILE });
    const count = await models.Product.countDocuments();
    expect(count).toBe(first.products.length);
    const skus = (await models.ProductVariant.find().lean()).map((v) => v.sku);
    expect(new Set(skus).size).toBe(skus.length);
    for (const s of skus) expect(s).toMatch(/^DDG-[A-Z]{3}-\d{3}$/);
  });

  test('re-running is idempotent (no duplicates, nothing changed)', async () => {
    const again = await importProducts({ file: FILE });
    expect(again.summary.created).toBe(0);
    expect(again.summary.updated).toBe(0);
    expect(again.summary.unchanged).toBe(first.products.length);
    expect(await models.Product.countDocuments()).toBe(first.products.length);
  });

  test('visibility rules: (Remove) items archived, restricted/claim items held for review', async () => {
    const archived = await models.Product.find({ status: 'archived' }).lean();
    expect(archived.map((p) => p.name)).toEqual(expect.arrayContaining(['Army-Pattern Tactical Plate Carrier', 'Army-Pattern Combat Bag 35 L']));
    const stun = await models.Product.findOne({ name: /Stun Gloves/ }).lean();
    expect(stun.status).toBe('review');
    expect(stun.compliance.legalReview.status).toBe('pending');
    const helmet = await models.Product.findOne({ name: /Airsoft Helmet/ }).lean();
    expect(helmet.compliance.warnings.join(' ')).toMatch(/Not bulletproof/);
    const pepper = await models.Product.findOne({ name: 'Pepper Spray' }).lean();
    expect(pepper.compliance).toMatchObject({ minAge: 18, domesticOnly: true, returnable: false });
  });

  test('prices reconcile and GST rules are per product', async () => {
    expect(first.reconciliation.filter((r) => !r.ok)).toHaveLength(0);
    const cap = await models.Product.findOne({ name: 'Jungle Pattern Cap' }).lean();
    expect(cap.pricing).toMatchObject({ gstRule: 'apparel_threshold', gstRate: 5, priceInclusive: 52395 });
    const oil = await models.Product.findOne({ name: /Super Pro 4T/ }).lean();
    expect(oil.compliance.netQuantity).toBe('900 ml');
  });

  test('internal notes and placeholders are never public', async () => {
    const stove = await models.Product.findOne({ name: 'Portable Cassette Gas Stove' }).lean();
    const hidden = stove.specifications.filter((s) => !s.isPublic).map((s) => s.label);
    expect(hidden).toEqual(expect.arrayContaining(['Power output', 'Ignition']));
  });

  test('manually edited fields survive a re-import of changed source data', async () => {
    const p = await models.Product.findOne({ name: 'Tactical Rugged Metal Torch' });
    p.description = 'Edited by an admin';
    p.manuallyEditedFields = ['description'];
    p.source.hash = 'force-update';
    await p.save();
    await importProducts({ file: FILE });
    const after = await models.Product.findById(p._id).lean();
    expect(after.description).toBe('Edited by an admin');
  });
});
