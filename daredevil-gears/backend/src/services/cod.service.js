'use strict';

/**
 * Cash on delivery rules (Admin → Settings → Checkout).
 *  - fee = fixed COD fee + (optionally) the courier's COD charge quoted by Shiprocket
 *  - limits: on/off, guests allowed, min / max order value, open COD orders per customer
 * Stock is committed and the order is confirmed at placement; the payment is marked collected
 * when the order is marked delivered.
 */
const { Order } = require('../models');

const OPEN = ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'cancellation_requested'];
const rupees = (p) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Checks that do not need a delivery quote. `orderValue` = total before the COD fee. */
function baseEligibility(cfg, { user, country = 'IN', orderValue }) {
  if (!cfg.codEnabled) return { ok: false, reason: 'Cash on delivery is not offered right now.' };
  if (!user && !cfg.codGuestAllowed) return { ok: false, reason: 'Sign in to use cash on delivery.' };
  if (country !== 'IN') return { ok: false, reason: 'Cash on delivery is available within India only.' };
  if (cfg.codMinOrderValue && orderValue < cfg.codMinOrderValue) return { ok: false, reason: `Cash on delivery is available on orders of ${rupees(cfg.codMinOrderValue)} or more.` };
  if (cfg.codMaxOrderValue && orderValue > cfg.codMaxOrderValue) return { ok: false, reason: `Cash on delivery is available on orders up to ${rupees(cfg.codMaxOrderValue)}. Please pay online.` };
  return { ok: true };
}

/** COD fee for a chosen delivery option (paise, GST-inclusive). */
function fee(cfg, option) {
  return (cfg.codFee || 0) + (cfg.codAddCourierCharge && option?.codCharge ? option.codCharge : 0);
}

/** Limit unfulfilled COD orders per customer (refused-parcel abuse). */
async function assertOpenOrdersBelowLimit(cfg, { email, phone }) {
  const limit = cfg.codMaxOpenOrders || 3;
  const or = [{ email: String(email || '').toLowerCase() }];
  if (phone) or.push({ phone });
  const open = await Order.countDocuments({ 'payment.provider': 'cod', status: { $in: OPEN }, $or: or });
  if (open >= limit) {
    const { ApiError } = require('../utils/http');
    throw ApiError.unprocessable(`You already have ${open} cash-on-delivery order${open > 1 ? 's' : ''} on the way. Please pay online for this one, or wait until they are delivered.`, { code: 'COD_LIMIT' });
  }
}

module.exports = { baseEligibility, fee, assertOpenOrdersBelowLimit };
