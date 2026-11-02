'use strict';

/**
 * Automatic cart offers (Admin → Offers). Two kinds:
 *  - bundle    "Buy these together for ₹X": a fixed set of products (with quantities) at one price.
 *              Applies once per complete set in the cart.
 *  - multi_buy "Buy N or more, get P% off": any N units from the chosen products/categories.
 *
 * Rules
 *  - Savings are always computed from the current selling prices; an offer that would not make the
 *    customer pay less is skipped (no fake discounts).
 *  - Each unit in the cart is used by at most one offer (offers run in priority order, highest saving
 *    wins ties is not attempted — admin decides the order).
 *  - Offer discounts are shared across the units they apply to in proportion to their price, so GST
 *    is computed on the real (lower) selling price of every line.
 *  - `combinableWithCoupons: false` keeps coupons off the lines the offer used.
 */
const { Offer } = require('../models');

let cache = { exp: 0, offers: [] };
const TTL = 30_000;

function activeFilter(now = new Date()) {
  return { isActive: true, $and: [{ $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }] }, { $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gt: now } }] }] };
}

async function active() {
  if (cache.exp > Date.now()) return cache.offers;
  const offers = await Offer.find(activeFilter()).sort({ priority: 1, createdAt: 1 }).lean();
  cache = { exp: Date.now() + TTL, offers };
  return offers;
}

function clearCache() {
  cache = { exp: 0, offers: [] };
}

/** Split `total` across `weights` in whole paise (largest remainder), never exceeding each weight. */
function share(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || !total) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    if (out[i] < weights[i]) {
      out[i] += 1;
      left -= 1;
    }
  }
  return out;
}

const pid = (l) => String(l.product._id);
const vid = (l) => String(l.variant._id);
const unitOf = (l) => l.unit ?? Math.round(l.lineTotal / l.quantity);

function inScope(offer, line) {
  const products = new Set((offer.eligibleProducts || []).map(String));
  const cats = new Set((offer.eligibleCategories || []).map(String));
  if (!products.size && !cats.size) return true;
  if (products.has(pid(line))) return true;
  const lc = [String(line.product.category), ...(line.product.categoryPath || []).map(String)];
  return lc.some((c) => cats.has(c));
}

/**
 * Work out which offers apply to these cart lines.
 * lines: [{ product, variant, quantity, unit, lineTotal }]
 * Returns { lineDiscounts[], total, applied[], lockedIdx:number[], nudges[] }
 */
function compute(lines, offers) {
  const remaining = lines.map((l) => l.quantity); // units not yet used by an offer
  const lineDiscounts = lines.map(() => 0);
  const locked = new Set();
  const applied = [];
  const nudges = [];

  for (const offer of offers) {
    if (offer.type === 'bundle') {
      const parts = (offer.items || []).filter((it) => it.product && it.quantity > 0);
      if (parts.length < 1) continue;
      // lines that can supply each part (a fixed variant, or any variant of the product)
      const supply = parts.map((it) => lines.map((l, i) => i).filter((i) => pid(lines[i]) === String(it.product) && (!it.variant || vid(lines[i]) === String(it.variant))));
      const setsAvailable = Math.min(...parts.map((it, k) => Math.floor(supply[k].reduce((s, i) => s + remaining[i], 0) / it.quantity)));
      if (!setsAvailable) {
        // show "add X to get the combo price" when the customer already has part of the set
        const have = parts.filter((it, k) => supply[k].some((i) => remaining[i] > 0)).length;
        if (have > 0 && have < parts.length) nudges.push({ offerId: String(offer._id), name: offer.name, type: 'bundle', message: offer.description || `Complete the "${offer.name}" combo to get the combo price.` });
        continue;
      }
      // take units for one set at a time (cheapest-first is irrelevant: price per set is fixed)
      let sets = 0;
      const used = lines.map(() => 0);
      for (let s = 0; s < setsAvailable; s++) {
        const take = lines.map(() => 0);
        let regular = 0;
        for (let k = 0; k < parts.length; k++) {
          let need = parts[k].quantity;
          for (const i of supply[k]) {
            const free = remaining[i] - used[i] - take[i];
            const t = Math.min(free, need);
            if (t > 0) {
              take[i] += t;
              need -= t;
              regular += t * unitOf(lines[i]);
            }
            if (!need) break;
          }
        }
        const saving = regular - offer.bundlePrice;
        if (saving <= 0) break; // combo is not cheaper at today's prices → do not apply
        const per = share(saving, take.map((t, i) => t * unitOf(lines[i])));
        take.forEach((t, i) => {
          used[i] += t;
          lineDiscounts[i] += per[i];
        });
        sets += 1;
      }
      if (!sets) continue;
      let saved = 0;
      used.forEach((u, i) => {
        if (!u) return;
        remaining[i] -= u;
        if (!offer.combinableWithCoupons) locked.add(i);
      });
      saved = lineDiscounts.reduce((a, b) => a + b, 0) - applied.reduce((a, o) => a + o.saving, 0);
      applied.push({ offerId: String(offer._id), name: offer.name, type: 'bundle', times: sets, saving: saved });
    } else if (offer.type === 'multi_buy') {
      const idx = lines.map((l, i) => i).filter((i) => remaining[i] > 0 && inScope(offer, lines[i]));
      const units = idx.reduce((s, i) => s + remaining[i], 0);
      const min = Math.max(2, offer.minQuantity || 2);
      if (units < min) {
        if (units > 0) nudges.push({ offerId: String(offer._id), name: offer.name, type: 'multi_buy', missing: min - units, message: `Add ${min - units} more eligible item${min - units > 1 ? 's' : ''} to get ${offer.percentOff}% off (${offer.name}).` });
        continue;
      }
      const weights = idx.map((i) => remaining[i] * unitOf(lines[i]));
      const base = weights.reduce((a, b) => a + b, 0);
      let saving = Math.floor((base * (offer.percentOff || 0)) / 100);
      if (offer.maxDiscount) saving = Math.min(saving, offer.maxDiscount);
      if (saving <= 0) continue;
      const per = share(saving, weights);
      idx.forEach((i, k) => {
        lineDiscounts[i] += per[k];
        remaining[i] = 0;
        if (!offer.combinableWithCoupons) locked.add(i);
      });
      applied.push({ offerId: String(offer._id), name: offer.name, type: 'multi_buy', times: 1, saving });
    }
  }
  const total = lineDiscounts.reduce((a, b) => a + b, 0);
  return { lineDiscounts, total, applied, lockedIdx: [...locked], nudges };
}

async function apply(lines, { now } = {}) {
  if (!lines.length) return compute([], []);
  const offers = await active();
  const usable = offers.filter((o) => (!o.startsAt || new Date(o.startsAt) <= (now || new Date())) && (!o.endsAt || new Date(o.endsAt) > (now || new Date())));
  return compute(lines, usable);
}

/** Lines as the coupon engine should see them: prices after offers; offer-locked lines excluded. */
function linesForCoupon(lines, result) {
  return lines.map((l, i) => ({ ...l, lineTotal: l.lineTotal - (result?.lineDiscounts?.[i] || 0) }));
}

/** Offers that include a product (by id, or by category for multi-buy). */
async function forProduct(product) {
  const offers = await active();
  const id = String(product._id);
  return offers.filter((o) => o.showOnProductPage !== false && (o.type === 'bundle' ? (o.items || []).some((it) => String(it.product) === id) : inScope(o, { product })));
}

/**
 * Customer-facing view of an offer with live prices. Bundles whose products are not all on sale
 * right now, or that would not save money at today's prices, are left out (returns null).
 */
async function publicView(offer) {
  const catalog = require('./catalog.service');
  const pricing = require('./pricing.service');
  const { Product, ProductVariant } = require('../models');
  const base = { id: String(offer._id), name: offer.name, description: offer.description || '', type: offer.type, image: offer.image?.url || null, endsAt: offer.endsAt || null, combinableWithCoupons: Boolean(offer.combinableWithCoupons) };
  if (offer.type === 'multi_buy') {
    const { Category, Product } = require('../models');
    let link = null;
    let scope = null;
    if ((offer.eligibleCategories || []).length) {
      const cats = await Category.find({ _id: { $in: offer.eligibleCategories }, isActive: true }).select('name slug').lean();
      if (cats.length) {
        link = `/category/${cats[0].slug}`;
        scope = cats.map((c) => c.name).join(', ');
      }
    }
    if (!link && (offer.eligibleProducts || []).length) {
      const prods = await Product.find({ _id: { $in: offer.eligibleProducts }, status: 'published' }).select('name slug').limit(3).lean();
      if (prods.length) {
        link = prods.length === 1 ? `/product/${prods[0].slug}` : `/search?q=${encodeURIComponent(prods[0].name.split(' ').slice(0, 2).join(' '))}`;
        scope = `${prods.map((p) => p.name).join(', ')}${offer.eligibleProducts.length > prods.length ? ' and more' : ''}`;
      }
    }
    if (!link) return null;
    return { ...base, minQuantity: offer.minQuantity, percentOff: offer.percentOff, maxDiscount: offer.maxDiscount || null, link, scope };
  }

  const items = [];
  let regular = 0;
  for (const it of offer.items || []) {
    const product = await Product.findOne({ _id: it.product, status: 'published' }).lean();
    if (!product) return null;
    const variant = it.variant ? await ProductVariant.findOne({ _id: it.variant, isActive: true }).lean() : await ProductVariant.findOne({ product: product._id, isActive: true }).sort({ isDefault: -1, sortOrder: 1 }).lean();
    if (!variant) return null;
    const unit = pricing.unitPrice(product, variant).unit;
    const inStock = variant.trackInventory === false || variant.available >= it.quantity;
    regular += unit * it.quantity;
    const [card] = await catalog.productsByIds([product._id]);
    items.push({ product: card || { id: String(product._id), name: product.name, slug: product.slug }, variantId: String(variant._id), variantTitle: variant.title, quantity: it.quantity, unitPrice: unit, inStock });
  }
  const saving = regular - offer.bundlePrice;
  if (saving <= 0) return null;
  return { ...base, items, regularPrice: regular, bundlePrice: offer.bundlePrice, saving, inStock: items.every((i) => i.inStock) };
}

module.exports = { apply, compute, linesForCoupon, forProduct, publicView, active, clearCache, share };
