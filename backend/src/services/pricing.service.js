'use strict';

/**
 * Pricing & GST engine. Pure functions — every amount is integer paise.
 *
 * Model (per the fix plan / Consumer Protection (E-Commerce) Rules):
 *  - Consumer prices are GST-inclusive ("Inclusive of all taxes").
 *  - GST is never shown as a discount. A struck-through price is only shown for a genuine,
 *    time-bound sale configured by an admin with a reference-price note.
 *  - Packaging and delivery are separate, disclosed lines that also carry GST.
 *  - Product-specific GST: fixed rate, or the apparel/footwear value-threshold rule
 *    (≤ threshold per piece → low rate, above → high rate).
 */

const { splitInclusive, allocate } = require('../utils/money');

const DEFAULT_TAX_CONFIG = Object.freeze({
  sellerState: 'Uttar Pradesh',
  apparelRule: { thresholdPerPiece: 250000, lowRate: 5, highRate: 18 },
  shippingTaxRate: 18,
  packagingTaxMode: 'item_rate',
  packagingFixedRate: 18,
});

function isSaleActive(sale, now = new Date()) {
  if (!sale?.active || !sale.priceInclusive) return false;
  if (sale.startsAt && new Date(sale.startsAt) > now) return false;
  if (sale.endsAt && new Date(sale.endsAt) < now) return false;
  return true;
}

/** Unit price the customer pays (incl. GST) and the genuine regular price. */
function unitPrice(product, variant, now = new Date()) {
  const regular = variant?.priceInclusive ?? product.pricing.priceInclusive;
  const sale = product.pricing?.sale;
  if (!variant?.priceInclusive && isSaleActive(sale, now) && sale.priceInclusive < regular) {
    return { unit: sale.priceInclusive, regular, onSale: true, saleEndsAt: sale.endsAt || null };
  }
  return { unit: regular, regular, onSale: false, saleEndsAt: null };
}

/** GST rate applicable to one unit sold at `unitInclusive` (paise). */
function gstRateFor(product, unitInclusive, taxConfig = DEFAULT_TAX_CONFIG) {
  if (product.pricing?.gstRule === 'apparel_threshold') {
    const rule = taxConfig.apparelRule || DEFAULT_TAX_CONFIG.apparelRule;
    const taxableAtLow = Math.round((unitInclusive * 100) / (100 + rule.lowRate));
    return taxableAtLow <= rule.thresholdPerPiece ? rule.lowRate : rule.highRate;
  }
  return Number(product.pricing?.gstRate ?? 18);
}

function packagingFor(lines, mode) {
  if (mode === 'included') return lines.map(() => 0);
  if (mode === 'per_unit') return lines.map((l) => (l.product.packagingCharge || 0) * l.quantity);
  if (mode === 'per_order_max') {
    const max = Math.max(0, ...lines.map((l) => l.product.packagingCharge || 0));
    const idx = lines.findIndex((l) => (l.product.packagingCharge || 0) === max);
    return lines.map((_, i) => (i === idx ? max : 0));
  }
  // per_line (default): one packaging charge per product line
  return lines.map((l) => l.product.packagingCharge || 0);
}

/**
 * Compute a full price quote.
 * @param {object} p
 * @param {Array<{product, variant, quantity}>} p.lines
 * @param {{discount:number, eligibleLineIdx:number[], code:string}|null} p.coupon  pre-computed by coupon.service
 * @param {{charge:number}|null} p.shipping  delivery charge incl. GST (null = not yet known)
 * @param {string} p.packagingMode
 * @param {object} p.taxConfig
 * @param {string} p.shipState  destination state (for CGST/SGST vs IGST)
 */
function quote({ lines, coupon = null, offers = null, shipping = null, cod = null, packagingMode = 'per_line', taxConfig = DEFAULT_TAX_CONFIG, shipState, now = new Date() }) {
  const priced = lines.map((l) => {
    const p = unitPrice(l.product, l.variant, now);
    return { ...l, unit: p.unit, regular: p.regular, onSale: p.onSale, lineTotal: p.unit * l.quantity };
  });

  const itemsTotal = priced.reduce((s, l) => s + l.lineTotal, 0);

  // automatic offers first (combo / multi-buy), worked out by offer.service
  const offerDisc = priced.map((l, i) => Math.min(offers?.lineDiscounts?.[i] || 0, l.lineTotal));
  const offerDiscount = offerDisc.reduce((a, b) => a + b, 0);

  // coupon allocation across eligible lines, on what is left after offers
  const locked = new Set(offers?.lockedIdx || []);
  const eligible = new Set((coupon?.eligibleLineIdx ?? priced.map((_, i) => i)).filter((i) => !locked.has(i)));
  const weights = priced.map((l, i) => (eligible.has(i) ? l.lineTotal - offerDisc[i] : 0));
  const discountTotal = Math.min(coupon?.discount || 0, weights.reduce((a, b) => a + b, 0));
  const couponDisc = allocate(discountTotal, weights);
  const discounts = couponDisc.map((d, i) => d + offerDisc[i]);

  const packaging = packagingFor(priced, packagingMode);
  const breakup = new Map();
  const addBreakup = (rate, taxable, tax) => {
    const cur = breakup.get(rate) || { rate, taxable: 0, tax: 0 };
    cur.taxable += taxable;
    cur.tax += tax;
    breakup.set(rate, cur);
  };

  let packagingTax = 0;
  const items = priced.map((l, i) => {
    const net = l.lineTotal - discounts[i];
    const perUnitNet = Math.round(net / l.quantity);
    const rate = gstRateFor(l.product, perUnitNet, taxConfig);
    const { taxable, tax } = splitInclusive(net, rate);
    addBreakup(rate, taxable, tax);

    const pkg = packaging[i];
    if (pkg) {
      const pkgRate = taxConfig.packagingTaxMode === 'fixed' ? taxConfig.packagingFixedRate : rate;
      const s = splitInclusive(pkg, pkgRate);
      packagingTax += s.tax;
      addBreakup(pkgRate, s.taxable, s.tax);
    }
    return {
      index: i,
      product: l.product,
      variant: l.variant,
      quantity: l.quantity,
      unitPriceInclusive: l.unit,
      regularUnitPriceInclusive: l.regular,
      onSale: l.onSale,
      lineTotalInclusive: l.lineTotal,
      discount: discounts[i],
      offerDiscount: offerDisc[i],
      couponDiscount: couponDisc[i],
      netTotal: net,
      packagingCharge: pkg,
      gstRate: rate,
      taxableValue: taxable,
      taxAmount: tax,
    };
  });

  const packagingCharge = packaging.reduce((a, b) => a + b, 0);
  const shippingCharge = shipping?.charge || 0;
  let shippingTax = 0;
  if (shippingCharge) {
    const s = splitInclusive(shippingCharge, taxConfig.shippingTaxRate);
    shippingTax = s.tax;
    addBreakup(taxConfig.shippingTaxRate, s.taxable, s.tax);
  }

  // cash-on-delivery fee: a service charge, taxed like delivery (GST-inclusive)
  const codCharge = cod?.charge || 0;
  let codTax = 0;
  if (codCharge) {
    const s = splitInclusive(codCharge, taxConfig.shippingTaxRate);
    codTax = s.tax;
    addBreakup(taxConfig.shippingTaxRate, s.taxable, s.tax);
  }

  const netItems = itemsTotal - discountTotal - offerDiscount;
  const grandTotal = netItems + packagingCharge + shippingCharge + codCharge;
  const taxBreakup = [...breakup.values()].sort((a, b) => a.rate - b.rate);
  const taxTotal = taxBreakup.reduce((s, b) => s + b.tax, 0);
  const taxableTotal = taxBreakup.reduce((s, b) => s + b.taxable, 0);

  const intra = shipState ? normaliseState(shipState) === normaliseState(taxConfig.sellerState) : null;
  const split =
    intra === null
      ? {}
      : intra
        ? { supplyType: 'intra', cgst: Math.floor(taxTotal / 2), sgst: taxTotal - Math.floor(taxTotal / 2), igst: 0 }
        : { supplyType: 'inter', cgst: 0, sgst: 0, igst: taxTotal };

  return {
    items,
    totals: {
      itemsTotal,
      discount: discountTotal,
      couponCode: coupon?.code || null,
      offerDiscount,
      offers: offerDiscount ? (offers?.applied || []) : [],
      netItems,
      packagingCharge,
      packagingTax,
      shippingCharge,
      shippingTax,
      shippingKnown: shipping !== null,
      codCharge,
      codTax,
      taxableTotal,
      taxTotal,
      taxBreakup,
      grandTotal,
      ...split,
    },
  };
}

function normaliseState(s) {
  return String(s || '').toLowerCase().replace(/[^a-z]/g, '');
}

/** Reconcile a source row: does base × (1 + GST) equal the supplied inclusive price? */
function reconcile({ basePaise, gstRate, inclusivePaise, tolerance = 2 }) {
  if (basePaise == null || inclusivePaise == null || gstRate == null) return { ok: false, reason: 'missing_values' };
  const expected = Math.round((basePaise * (100 + gstRate)) / 100);
  const diff = inclusivePaise - expected;
  return { ok: Math.abs(diff) <= tolerance, expected, diff };
}

module.exports = { DEFAULT_TAX_CONFIG, isSaleActive, unitPrice, gstRateFor, packagingFor, quote, reconcile, normaliseState };
