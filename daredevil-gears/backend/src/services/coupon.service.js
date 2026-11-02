'use strict';

const { Coupon, CouponRedemption, Order } = require('../models');
const { ApiError } = require('../utils/http');
const { formatINR } = require('../shared');

const fail = (message, code = 'COUPON_INVALID') => ApiError.unprocessable(message, { code });

/**
 * Validate a coupon against priced lines. All money in paise. Server-side only.
 * @returns {{ coupon, code, discount, eligibleLineIdx }}
 */
async function evaluate(code, { lines, user, email, now = new Date() }) {
  const normalised = String(code || '').trim().toUpperCase();
  if (!normalised) throw fail('Enter a coupon code');
  const coupon = await Coupon.findOne({ code: normalised }).lean();
  if (!coupon || !coupon.isActive) throw fail('This coupon code is not valid');
  if (coupon.startsAt && new Date(coupon.startsAt) > now) throw fail('This coupon is not active yet');
  if (coupon.endsAt && new Date(coupon.endsAt) < now) throw fail('This coupon has expired', 'COUPON_EXPIRED');
  if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) throw fail('This coupon has reached its usage limit', 'COUPON_EXHAUSTED');

  const identity = user ? { $or: [{ user: user._id }, { email: user.email }] } : email ? { email: email.toLowerCase() } : null;
  if (coupon.perCustomerLimit && identity) {
    const used = await CouponRedemption.countDocuments({ coupon: coupon._id, status: { $in: ['reserved', 'used'] }, ...identity });
    if (used >= coupon.perCustomerLimit) throw fail('You have already used this coupon', 'COUPON_PER_CUSTOMER');
  }
  if (coupon.newCustomersOnly) {
    if (!identity) throw fail('Sign in or enter your email to use this coupon', 'COUPON_NEEDS_IDENTITY');
    const prior = await Order.countDocuments({ ...identity, 'payment.status': { $in: ['captured', 'refunded', 'partially_refunded'] } });
    if (prior > 0) throw fail('This coupon is for first orders only', 'COUPON_NEW_ONLY');
  }

  const productIds = new Set((coupon.eligibleProducts || []).map(String));
  const categoryIds = new Set((coupon.eligibleCategories || []).map(String));
  const eligibleLineIdx = [];
  let eligibleTotal = 0;
  lines.forEach((l, i) => {
    const pid = String(l.product._id);
    const cats = [String(l.product.category), ...(l.product.categoryPath || []).map(String)];
    const productOk = !productIds.size && !categoryIds.size ? true : productIds.has(pid) || cats.some((c) => categoryIds.has(c));
    const saleOk = !coupon.excludeSaleItems || !l.onSale;
    if (productOk && saleOk) {
      eligibleLineIdx.push(i);
      eligibleTotal += l.lineTotal;
    }
  });
  if (!eligibleLineIdx.length) throw fail('This coupon does not apply to the items in your cart', 'COUPON_NOT_APPLICABLE');

  const cartTotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  if (coupon.minCartValue && cartTotal < coupon.minCartValue) {
    throw fail(`Add items worth ${formatINR(coupon.minCartValue - cartTotal)} more to use this coupon (minimum ${formatINR(coupon.minCartValue)})`, 'COUPON_MIN_CART');
  }

  let discount = coupon.type === 'percent' ? Math.floor((eligibleTotal * coupon.value) / 100) : coupon.value;
  if (coupon.type === 'percent' && coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, eligibleTotal);
  return { coupon, code: coupon.code, discount, eligibleLineIdx, description: coupon.description };
}

/** Reserve one use of the coupon for an order (atomic against the global usage limit). */
async function reserve(coupon, { order, user, email, amount }) {
  // Increment first, then check our own post-increment value: concurrent callers each see a distinct
  // count, so exactly `usageLimit` reservations survive and the rest roll back.
  const updated = await Coupon.findOneAndUpdate({ _id: coupon._id, isActive: true }, { $inc: { usageCount: 1 } }, { new: true });
  if (!updated || (updated.usageLimit != null && updated.usageCount > updated.usageLimit)) {
    if (updated) await Coupon.updateOne({ _id: coupon._id }, { $inc: { usageCount: -1 } });
    throw fail('This coupon has reached its usage limit', 'COUPON_EXHAUSTED');
  }
  await CouponRedemption.create({ coupon: coupon._id, order, user, email: email?.toLowerCase(), amount, status: 'reserved' });
}

async function markUsed(orderId) {
  await CouponRedemption.updateMany({ order: orderId, status: 'reserved' }, { $set: { status: 'used' } });
}

async function release(orderId, { includeUsed = false } = {}) {
  const statuses = includeUsed ? ['reserved', 'used'] : ['reserved'];
  const reds = await CouponRedemption.find({ order: orderId, status: { $in: statuses } });
  for (const r of reds) {
    const res = await CouponRedemption.updateOne({ _id: r._id, status: r.status }, { $set: { status: 'released' } });
    if (res.modifiedCount) await Coupon.updateOne({ _id: r.coupon, usageCount: { $gt: 0 } }, { $inc: { usageCount: -1 } });
  }
}

module.exports = { evaluate, reserve, markUsed, release };
