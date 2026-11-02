'use strict';

const { Cart, Product, ProductVariant } = require('../models');
const { ApiError } = require('../utils/http');
const { sha256, randomToken } = require('../utils/crypto');
const pricing = require('./pricing.service');
const couponService = require('./coupon.service');
const shipping = require('./shipping.service');
const codService = require('./cod.service');
const offerService = require('./offer.service');
const settings = require('./settings.service');
const tax = require('./tax.service');
const catalog = require('./catalog.service');
const { formatINR } = require('../shared');

const MAX_PER_LINE = 10;
const GUEST_TTL_DAYS = 30;

// ---------------- cart lookup ----------------

async function findCart({ user, guestToken }) {
  if (user) return Cart.findOne({ user: user._id });
  if (guestToken) return Cart.findOne({ guestTokenHash: sha256(guestToken) });
  return null;
}

async function getOrCreateCart({ user, guestToken }) {
  let cart = await findCart({ user, guestToken });
  let newGuestToken = null;
  if (!cart) {
    if (user) {
      cart = await Cart.create({ user: user._id, items: [] });
    } else {
      newGuestToken = guestToken || randomToken(24);
      cart = await Cart.create({ guestTokenHash: sha256(newGuestToken), items: [], expiresAt: new Date(Date.now() + GUEST_TTL_DAYS * 86400_000) });
    }
  } else if (!user) {
    cart.expiresAt = new Date(Date.now() + GUEST_TTL_DAYS * 86400_000);
  }
  return { cart, newGuestToken };
}

// ---------------- line loading & validation ----------------

/**
 * Load products/variants for raw items and validate each against live data.
 * Returns { lines (purchasable), problems (notices for the shopper), changed (cart needs saving) }.
 */
async function loadLines(items) {
  const productIds = items.map((i) => i.product);
  const variantIds = items.map((i) => i.variant);
  const [products, variants] = await Promise.all([
    Product.find({ _id: { $in: productIds } }).lean(),
    ProductVariant.find({ _id: { $in: variantIds } }).lean(),
  ]);
  const pMap = new Map(products.map((p) => [String(p._id), p]));
  const vMap = new Map(variants.map((v) => [String(v._id), v]));
  const activeCats = new Set((await catalog.activeCategories()).map((c) => String(c._id)));

  const lines = [];
  const problems = [];
  const removedIds = new Set();
  let changed = false;

  for (const item of items) {
    const product = pMap.get(String(item.product));
    const variant = vMap.get(String(item.variant));
    const name = product?.name || 'An item';
    if (!product || !variant || product.status !== 'published' || !variant.isActive || !activeCats.has(String(product.category))) {
      problems.push({ itemId: String(item._id), type: 'unavailable', message: `${name} is no longer available and was removed from your cart.` });
      removedIds.add(String(item._id));
      changed = true;
      continue;
    }
    const available = variant.trackInventory === false ? MAX_PER_LINE : variant.available;
    if (available <= 0) {
      problems.push({ itemId: String(item._id), type: 'out_of_stock', message: `${name} is out of stock.` });
      lines.push({ item, product, variant, quantity: item.quantity, available: 0, blocked: true });
      continue;
    }
    let quantity = item.quantity;
    const max = Math.min(MAX_PER_LINE, available);
    if (quantity > max) {
      problems.push({ itemId: String(item._id), type: 'quantity_reduced', message: `Only ${max} unit(s) of ${name} can be ordered right now — quantity updated.` });
      quantity = max;
      item.quantity = max;
      changed = true;
    }
    const price = pricing.unitPrice(product, variant);
    if (item.seenUnitPrice && item.seenUnitPrice !== price.unit) {
      problems.push({
        itemId: String(item._id),
        type: 'price_changed',
        message: `The price of ${name} changed from ${formatINR(item.seenUnitPrice)} to ${formatINR(price.unit)}.`,
      });
      item.seenUnitPrice = price.unit;
      changed = true;
    }
    lines.push({ item, product, variant, quantity, available, blocked: false, unit: price.unit, onSale: price.onSale, lineTotal: price.unit * quantity });
  }
  return { lines, problems, changed, removedIds };
}

// ---------------- view ----------------

async function buildView(cart, { user, email, destination, rateId, paymentMethod = 'online' } = {}) {
  const { lines, problems, changed, removedIds } = await loadLines(cart?.items || []);
  if (cart && changed) {
    cart.items = cart.items.filter((i) => !removedIds.has(String(i._id)));
    await cart.save();
  }
  const purchasable = lines.filter((l) => !l.blocked);
  const [checkoutCfg, taxConfig, shipCfg] = await Promise.all([settings.get('checkout'), tax.get(), settings.get('shipping')]);

  // automatic combo / multi-buy offers come first; coupons see the prices after them
  const offerResult = await offerService.apply(purchasable);

  let couponResult = null;
  let couponError = null;
  if (cart?.couponCode && purchasable.length) {
    try {
      couponResult = await couponService.evaluate(cart.couponCode, { lines: offerService.linesForCoupon(purchasable, offerResult), excludeLineIdx: offerResult.lockedIdx, user, email });
    } catch (err) {
      couponError = err.message;
      problems.push({ type: 'coupon_removed', message: `Coupon ${cart.couponCode} was removed: ${err.message}` });
      cart.couponCode = undefined;
      await cart.save();
    }
  }

  let shippingInfo = null;
  let shippingError = null;
  const preQuote = pricing.quote({ lines: purchasable, coupon: couponResult, offers: offerResult, packagingMode: checkoutCfg.packagingMode, taxConfig });
  // ---- cash on delivery: base rules first, then courier COD serviceability via the delivery quote
  const country = (destination?.country || 'IN').toUpperCase();
  const base = codService.baseEligibility(checkoutCfg, { user, country, orderValue: preQuote.totals.grandTotal });
  const cod = { enabled: Boolean(checkoutCfg.codEnabled), available: base.ok, reason: base.ok ? null : base.reason, selected: false, fee: 0 };
  let method = paymentMethod === 'cod' && base.ok ? 'cod' : 'online';

  if (destination?.pincode && purchasable.length) {
    try {
      shippingInfo = await shipping.options({ lines: purchasable, destination, netItemsTotal: preQuote.totals.netItems, paymentMethod: method });
    } catch (err) {
      if (err.status !== 422) throw err;
      if (method === 'cod' && err.code === 'COD_NOT_SERVICEABLE') {
        cod.available = false;
        cod.reason = err.message;
        method = 'online';
        try {
          shippingInfo = await shipping.options({ lines: purchasable, destination, netItemsTotal: preQuote.totals.netItems });
        } catch (e2) {
          if (e2.status !== 422) throw e2;
          shippingError = { code: e2.code, message: e2.message };
        }
      } else shippingError = { code: err.code, message: err.message };
    }
  }
  const chosen = (rateId && shippingInfo?.options?.find((o) => o.rateId === rateId)) || shippingInfo?.options?.[0] || null;
  if (method === 'cod' && chosen) {
    cod.selected = true;
    cod.fee = codService.fee(checkoutCfg, chosen);
  }
  const q = chosen
    ? pricing.quote({ lines: purchasable, coupon: couponResult, offers: offerResult, shipping: { charge: chosen.charge }, cod: cod.selected ? { charge: cod.fee } : null, packagingMode: checkoutCfg.packagingMode, taxConfig, shipState: destination?.state })
    : preQuote;

  const threshold = shipCfg.freeShippingEnabled ? shipCfg.freeShippingThreshold : null;
  const qByIndex = new Map(q.items.map((qi, idx) => [String(purchasable[idx].item._id), qi]));

  return {
    id: cart ? String(cart._id) : null,
    items: lines.map((l) => {
      const qi = qByIndex.get(String(l.item._id));
      return {
        id: String(l.item._id),
        product: catalog.serialiseCard(l.product),
        variant: { id: String(l.variant._id), sku: l.variant.sku, title: l.variant.title },
        quantity: l.quantity,
        maxQuantity: Math.min(MAX_PER_LINE, l.available),
        inStock: !l.blocked,
        unitPrice: qi?.unitPriceInclusive ?? pricing.unitPrice(l.product, l.variant).unit,
        regularUnitPrice: qi?.regularUnitPriceInclusive ?? null,
        lineTotal: qi?.lineTotalInclusive ?? 0,
        discount: qi?.discount ?? 0,
        offerDiscount: qi?.offerDiscount ?? 0,
        couponDiscount: qi?.couponDiscount ?? 0,
        packagingCharge: qi?.packagingCharge ?? 0,
        gstRate: qi?.gstRate ?? null,
      };
    }),
    count: lines.reduce((s, l) => s + l.quantity, 0),
    coupon: couponResult ? { code: couponResult.code, discount: couponResult.discount, description: couponResult.description } : null,
    couponError,
    totals: q.totals,
    packagingMode: checkoutCfg.packagingMode,
    shipping: shippingInfo ? { ...shippingInfo, selected: chosen } : null,
    shippingError,
    cod,
    offerNudges: offerResult.nudges,
    freeShipping: threshold
      ? { threshold, remaining: Math.max(0, threshold - q.totals.netItems), qualified: q.totals.netItems >= threshold }
      : null,
    requiresAgeConfirmation: purchasable.some((l) => (l.product.compliance?.minAge || 0) >= 18),
    domesticOnlyItems: purchasable.filter((l) => l.product.compliance?.domesticOnly).map((l) => l.product.name),
    notices: problems,
    canCheckout: purchasable.length > 0 && purchasable.length === lines.length,
  };
}

// ---------------- mutations ----------------

async function addItem(ctx, { productId, variantId, quantity = 1 }) {
  const product = await Product.findOne({ _id: productId, status: 'published' }).lean();
  if (!product) throw ApiError.notFound('This product is not available');
  const variant = variantId
    ? await ProductVariant.findOne({ _id: variantId, product: product._id, isActive: true }).lean()
    : await ProductVariant.findOne({ product: product._id, isActive: true }).sort({ isDefault: -1, sortOrder: 1 }).lean();
  if (!variant) throw ApiError.notFound('Please choose an available option');
  const available = variant.trackInventory === false ? MAX_PER_LINE : variant.available;
  if (available <= 0) throw ApiError.conflict(`${product.name} is out of stock`, { code: 'OUT_OF_STOCK' });

  const { cart, newGuestToken } = await getOrCreateCart(ctx);
  const existing = cart.items.find((i) => String(i.variant) === String(variant._id));
  const desired = (existing?.quantity || 0) + quantity;
  const max = Math.min(MAX_PER_LINE, available);
  if (desired > max) {
    if (existing && existing.quantity >= max) throw ApiError.conflict(`You already have the maximum available quantity (${max}) of ${product.name} in your cart`, { code: 'MAX_QUANTITY' });
  }
  const finalQty = Math.min(desired, max);
  const price = pricing.unitPrice(product, variant).unit;
  if (existing) {
    existing.quantity = finalQty;
    existing.seenUnitPrice = price;
  } else {
    if (cart.items.length >= 50) throw ApiError.badRequest('Your cart is full');
    cart.items.push({ product: product._id, variant: variant._id, quantity: finalQty, seenUnitPrice: price });
  }
  await cart.save();
  return { cart, newGuestToken, adjusted: finalQty !== desired ? finalQty : null };
}

/** Put every item of a combo offer in the cart (topping up lines that are already there). */
async function addOffer(ctx, offerId) {
  const { Offer } = require('../models');
  const offer = await Offer.findOne({ _id: offerId, type: 'bundle', isActive: true }).lean();
  const live = offer ? (await offerService.active()).some((o) => String(o._id) === String(offer._id)) : false;
  if (!offer || !live) throw ApiError.notFound('This offer has ended');
  const current = await findCart(ctx);
  const qtyOf = (x) => current?.items.find((i) => String(i.product) === String(x.product) && (!x.variant || String(i.variant) === String(x.variant)))?.quantity || 0;
  // one more complete set than the cart already holds
  const targetSets = 1 + Math.floor(Math.min(...offer.items.map((x) => qtyOf(x) / x.quantity)));
  let result = null;
  let token = ctx.guestToken;
  for (const it of offer.items) {
    const missing = targetSets * it.quantity - qtyOf(it);
    if (missing <= 0) continue;
    result = await addItem({ ...ctx, guestToken: token }, { productId: it.product, variantId: it.variant || undefined, quantity: missing });
    if (result.newGuestToken) token = result.newGuestToken;
  }
  if (result && token !== ctx.guestToken) result.newGuestToken = token;
  return result || { cart: await findCart(ctx), newGuestToken: null };
}

async function updateItem(ctx, itemId, quantity) {
  const cart = await findCart(ctx);
  const item = cart?.items.id(itemId);
  if (!item) throw ApiError.notFound('Item not found in cart');
  if (quantity <= 0) {
    item.deleteOne();
  } else {
    const variant = await ProductVariant.findById(item.variant).lean();
    const available = variant?.trackInventory === false ? MAX_PER_LINE : variant?.available || 0;
    if (available <= 0) throw ApiError.conflict('This item is out of stock', { code: 'OUT_OF_STOCK' });
    item.quantity = Math.min(quantity, MAX_PER_LINE, available);
  }
  await cart.save();
  return cart;
}

async function removeItem(ctx, itemId) {
  const cart = await findCart(ctx);
  const item = cart?.items.id(itemId);
  if (item) {
    item.deleteOne();
    await cart.save();
  }
  return cart;
}

async function applyCoupon(ctx, code, { email } = {}) {
  const cart = await findCart(ctx);
  if (!cart || !cart.items.length) throw ApiError.badRequest('Your cart is empty');
  const { lines } = await loadLines(cart.items);
  const purchasable = lines.filter((l) => !l.blocked);
  const offerResult = await offerService.apply(purchasable);
  const result = await couponService.evaluate(code, { lines: offerService.linesForCoupon(purchasable, offerResult), excludeLineIdx: offerResult.lockedIdx, user: ctx.user, email });
  cart.couponCode = result.code;
  await cart.save();
  return cart;
}

async function removeCoupon(ctx) {
  const cart = await findCart(ctx);
  if (cart) {
    cart.couponCode = undefined;
    await cart.save();
  }
  return cart;
}

/** Merge the guest cart into the user's cart after login/registration. */
async function mergeGuestCart(user, guestToken) {
  if (!guestToken) return;
  const guest = await Cart.findOne({ guestTokenHash: sha256(guestToken) });
  if (!guest || !guest.items.length) {
    if (guest) await guest.deleteOne();
    return;
  }
  const { cart } = await getOrCreateCart({ user });
  for (const gi of guest.items) {
    const existing = cart.items.find((i) => String(i.variant) === String(gi.variant));
    if (existing) existing.quantity = Math.min(MAX_PER_LINE, existing.quantity + gi.quantity);
    else if (cart.items.length < 50) cart.items.push({ product: gi.product, variant: gi.variant, quantity: gi.quantity, seenUnitPrice: gi.seenUnitPrice });
  }
  if (!cart.couponCode && guest.couponCode) cart.couponCode = guest.couponCode;
  await cart.save();
  await guest.deleteOne();
}

async function clear(ctx) {
  const cart = await findCart(ctx);
  if (cart) {
    cart.items = [];
    cart.couponCode = undefined;
    await cart.save();
  }
}

module.exports = { findCart, getOrCreateCart, loadLines, buildView, addItem, updateItem, removeItem, applyCoupon, removeCoupon, mergeGuestCart, clear, MAX_PER_LINE, addOffer };
