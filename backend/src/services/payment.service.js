'use strict';

/**
 * Payment state handling. An order is marked paid ONLY with verified evidence:
 *   - CCAvenue's encrypted response (only decryptable with our working key) with a matching amount, or
 *   - reconciliation that fetched a successful payment from the CCAvenue status API.
 * All paths funnel into markPaid(), which is idempotent (compare-and-set on order status).
 */

const { Order, Payment, Cart, Product, CouponRedemption, Coupon } = require('../models');
const { ApiError } = require('../utils/http');
const logger = require('../config/logger');
const env = require('../config/env');
const ccavenue = require('./ccavenue.service');
const inventory = require('./inventory.service');
const couponService = require('./coupon.service');
const orders = require('./order.service');
const email = require('./email.service');

function paymentMeta(p) {
  if (!p) return {};
  return { bank: p.bank, wallet: p.wallet, vpa: p.vpa, cardNetwork: p.card?.network, cardLast4: p.card?.last4 };
}

async function markPaid(order, { razorpayPaymentId, method, via, rzpPayment }) {
  const paidAt = new Date();
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, 'payment.status': { $ne: 'captured' }, status: { $in: ['pending_payment', 'payment_failed', 'expired'] } },
    {
      $set: {
        status: 'confirmed',
        placedAt: paidAt,
        'payment.status': 'captured',
        'payment.razorpayPaymentId': razorpayPaymentId,
        'payment.method': method,
        'payment.paidAt': paidAt,
        'payment.amountPaid': order.pricing.grandTotal,
      },
      $push: { statusHistory: { from: order.status, to: 'confirmed', at: paidAt, byRole: 'system', note: `Payment verified via ${via}` } },
    },
    { new: true }
  );
  if (!updated) return { order: await Order.findById(order._id), alreadyProcessed: true };

  await Payment.updateOne(
    { razorpayOrderId: order.payment.razorpayOrderId },
    {
      $set: { status: 'captured', razorpayPaymentId, method, verifiedVia: via, meta: paymentMeta(rzpPayment) },
      $push: { events: { type: 'payment.captured', note: `via ${via}` } },
    }
  );

  return { order: await afterConfirmed(updated), alreadyProcessed: false };
}

/**
 * Everything that happens once an order is confirmed (paid online, or placed as cash on delivery):
 * stock committed, coupon used, cart cleared, invoice number, emails, Shiprocket.
 */
async function afterConfirmed(updated) {
  // inventory: reservation → sale (falls back to available stock if the reservation had expired)
  const lines = updated.items.map((i) => ({ variant: i.variant, product: i.product, sku: i.sku, quantity: i.quantity }));
  await inventory.commit(lines, { order: updated._id });
  await Order.updateOne({ _id: updated._id }, { $set: { 'inventory.committed': true } });

  // coupon: reserved → used (re-count if the reservation had been released by expiry)
  const released = await CouponRedemption.find({ order: updated._id, status: 'released' });
  for (const r of released) {
    await CouponRedemption.updateOne({ _id: r._id }, { $set: { status: 'used' } });
    await Coupon.updateOne({ _id: r.coupon }, { $inc: { usageCount: 1 } });
  }
  await couponService.markUsed(updated._id);

  for (const i of updated.items) await Product.updateOne({ _id: i.product }, { $inc: { salesCount: i.quantity } });

  // remove purchased variants from the shopper's cart
  if (updated.user) {
    await Cart.updateOne({ user: updated.user }, { $pull: { items: { variant: { $in: updated.items.map((i) => i.variant) } } }, $unset: { couponCode: 1 } });
  }

  const withInvoice = await orders.assignInvoiceNumber(updated);
  await email.send('order_confirmation', withInvoice.email, { order: withInvoice.toObject(), orderUrl: orders.orderUrl(withInvoice) });
  await Order.updateOne({ _id: updated._id }, { $push: { notifications: { type: 'order_confirmation', to: withInvoice.email, status: 'queued' } } });
  email
    .notifyAdmins(`New ${withInvoice.payment?.provider === 'cod' ? 'cash-on-delivery ' : ''}order ${withInvoice.orderNumber}`, [`${withInvoice.customerName} · ${withInvoice.email}`, `Total ₹${(withInvoice.pricing.grandTotal / 100).toFixed(2)}${withInvoice.payment?.provider === 'cod' ? ' — collect on delivery' : ''}`, `${withInvoice.items.length} line(s)`], `${env.ADMIN_URL}/orders/${withInvoice._id}`)
    .catch(() => {});
  // send to Shiprocket (background job with retries; never blocks or fails the payment)
  await require('./shiprocket-sync.service').onPaid(withInvoice);
  return withInvoice;
}

/** Cash on delivery: confirm immediately; the amount is collected by the courier at delivery. */
async function confirmCod(order) {
  const now = new Date();
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: 'pending_payment', 'payment.provider': 'cod' },
    {
      $set: { status: 'confirmed', placedAt: now, 'payment.status': 'cod_pending', 'payment.method': 'cod' },
      $unset: { expiresAt: 1 },
      $push: { statusHistory: { from: 'pending_payment', to: 'confirmed', at: now, byRole: 'system', note: 'Cash on delivery order confirmed' } },
    },
    { new: true }
  );
  if (!updated) return Order.findById(order._id);
  return afterConfirmed(updated);
}

/**
 * CCAvenue sends the customer's browser back (POST encResp) after payment, failure or cancel.
 * Returns { orderNumber, paid, reason } for the controller to redirect with.
 */
async function handleCcavenueResponse(encResp) {
  const p = ccavenue.parseResponse(encResp);
  const order = await Order.findOne({ 'payment.razorpayOrderId': p.order_id });
  if (!order) throw ApiError.notFound('Order not found');

  if (p.order_status === 'Success') {
    if (ccavenue.toPaise(p.amount) !== order.pricing.grandTotal) {
      logger.error({ order: order.orderNumber, amount: p.amount }, 'Payment amount mismatch');
      return { orderNumber: order.orderNumber, paid: false, reason: 'mismatch' };
    }
    await markPaid(order, { razorpayPaymentId: p.tracking_id, method: String(p.payment_mode || '').toLowerCase() || undefined, via: 'ccavenue', rzpPayment: { bank: p.card_name } });
    return { orderNumber: order.orderNumber, paid: true };
  }

  const cancelled = p.order_status === 'Aborted';
  const description = String(p.failure_message || p.status_message || p.order_status || '').slice(0, 300);
  await Payment.updateOne(
    { razorpayOrderId: p.order_id, status: { $nin: ['captured', 'refunded', 'partially_refunded'] } },
    { $set: { status: 'failed', errorCode: p.status_code, errorDescription: description, errorReason: p.order_status }, $inc: { attempts: 1 }, $push: { events: { type: 'client.failure', note: description.slice(0, 200) } } }
  );
  await Order.updateOne({ _id: order._id, status: 'pending_payment' }, { $set: { 'payment.status': 'failed' } });
  return { orderNumber: order.orderNumber, paid: false, reason: cancelled ? 'cancelled' : 'failed' };
}

// ---------------- reconciliation & expiry ----------------

/** Look up a pending order at CCAvenue and mark it paid if a captured payment exists. */
async function reconcileOrder(order) {
  if (!order.payment?.razorpayOrderId) return 'no_rzp_order';
  let payments;
  try {
    payments = await ccavenue.fetchOrderPayments(order.payment.razorpayOrderId);
  } catch (err) {
    logger.warn({ err: err.message, order: order.orderNumber }, 'Reconcile: CCAvenue unreachable');
    return 'unreachable';
  }
  const captured = payments.find((p) => p.status === 'captured' && Number(p.amount) === order.pricing.grandTotal);
  if (captured) {
    await markPaid(order, { razorpayPaymentId: captured.id, method: captured.method, via: 'reconcile', rzpPayment: captured });
    return 'paid';
  }
  return payments.some((p) => p.status === 'failed') ? 'failed_attempts' : 'no_payment';
}

/** Expire unpaid orders past their hold: reconcile first, then release stock and coupon. */
async function expireStaleOrders({ limit = 50 } = {}) {
  const stale = await Order.find({ status: { $in: ['pending_payment', 'payment_failed'] }, expiresAt: { $lt: new Date() } }).limit(limit);
  const results = [];
  for (const order of stale) {
    const rec = env.ccavenueConfigured ? await reconcileOrder(order) : 'not_configured';
    if (rec === 'paid' || rec === 'unreachable') {
      results.push({ order: order.orderNumber, result: rec });
      continue;
    }
    const expired = await Order.findOneAndUpdate(
      { _id: order._id, status: order.status },
      { $set: { status: 'expired', 'inventory.released': true }, $push: { statusHistory: { from: order.status, to: 'expired', byRole: 'system', note: 'Payment not completed within the hold period' } } },
      { new: true }
    );
    if (!expired) continue;
    if (order.inventory?.reserved && !order.inventory?.released) {
      await inventory.release(order.items.map((i) => ({ variant: i.variant, quantity: i.quantity })), { order: order._id, reason: 'Unpaid order expired' });
    }
    await couponService.release(order._id);
    await Payment.updateOne({ order: order._id, status: { $in: ['created', 'failed'] } }, { $push: { events: { type: 'order.expired' } } });
    if (rec === 'failed_attempts' || order.payment?.status === 'failed') {
      await email.send('payment_failed', order.email, { order: order.toObject(), retryUrl: `${env.STOREFRONT_URL}/cart` });
    }
    results.push({ order: order.orderNumber, result: 'expired' });
  }
  return results;
}

module.exports = { markPaid, confirmCod, afterConfirmed, handleCcavenueResponse, reconcileOrder, expireStaleOrders };
