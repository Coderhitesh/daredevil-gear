'use strict';
/* eslint-disable no-console */

/**
 * Explains how packaging is being charged right now.
 *   npm run check:packaging                 → setting + products with / without a packaging charge
 *   npm run check:packaging -- <slug> [qty] → also the charge for that product at that quantity
 */
const { connectDB, disconnectDB } = require('../src/config/db');
const settings = require('../src/services/settings.service');
const pricing = require('../src/services/pricing.service');
const { Product, ProductVariant } = require('../src/models');

const inr = (p) => `₹${((p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const MODE = {
  per_line: 'Once per product line (2 units of the same product = charged once)',
  per_unit: 'Per unit (2 units = charged twice)',
  per_order_max: 'Only the highest single charge, once per order',
  included: 'INCLUDED IN PRICE — nothing is added at checkout',
};

(async () => {
  await connectDB();
  const cfg = await settings.get('checkout');
  console.log(`\nAdmin → Settings → Checkout → Packaging charge: ${cfg.packagingMode}`);
  console.log(`  ${MODE[cfg.packagingMode] || cfg.packagingMode}`);
  if (cfg.packagingMode === 'included') console.log('  ⚠ This is why no packaging line appears. Change it to "Once per product line" or "Per unit".');

  const live = { status: 'published' };
  const withPkg = await Product.countDocuments({ ...live, packagingCharge: { $gt: 0 } });
  const without = await Product.find({ ...live, $or: [{ packagingCharge: { $in: [0, null] } }, { packagingCharge: { $exists: false } }] }).select('name sku').lean();
  console.log(`\nPublished products with a packaging charge: ${withPkg}`);
  console.log(`Published products with NO packaging charge: ${without.length}`);
  without.slice(0, 25).forEach((p) => console.log(`  - ${p.sku}  ${p.name}`));
  if (without.length > 25) console.log(`  … and ${without.length - 25} more`);

  const [slug, qtyArg] = process.argv.slice(2);
  if (slug) {
    const p = await Product.findOne({ slug }).lean();
    if (!p) console.log(`\nNo product with slug "${slug}"`);
    else {
      const v = await ProductVariant.findOne({ product: p._id, isDefault: true }).lean();
      const qty = Math.max(1, Number(qtyArg) || 1);
      const q = pricing.quote({ lines: [{ product: p, variant: v, quantity: qty }], packagingMode: cfg.packagingMode });
      console.log(`\n${p.name} × ${qty}`);
      console.log(`  packaging set on product: ${inr(p.packagingCharge)} (status: ${p.status})`);
      console.log(`  items ${inr(q.totals.itemsTotal)} + packaging ${inr(q.totals.packagingCharge)} = ${inr(q.totals.grandTotal)} before delivery`);
    }
  }
  console.log('');
  await disconnectDB?.();
  process.exit(0);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
