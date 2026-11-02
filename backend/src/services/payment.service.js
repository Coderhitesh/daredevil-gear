'use strict';

/**
 * Payment state handling. An order is marked paid ONLY with verified evidence:
 *   - a valid Razorpay checkout signature (verified on the server), or
 *   - a signature-verified webhook (payment.captured / order.paid), or
 *   - reconciliation that fetched a captured payment from the Razorpay API.
 * All paths funnel into markPaid(), which is idempotent (compare-and-set on order status).
 */

const crypto = require('crypto');
const { Order, Payment, WebhookEvent, Cart, Product, CouponRedemption, Coupon, Refund, ReturnRequest } = require('../models');
const { ApiError } = require('../utils/http');
const logger = require('../config/logger');
const env = require('../config/env');
const razorpay = require('./razorpay.service');
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

/** Browser handler callback → server-side signature verification. */
async function verifyCheckoutPayment({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature }, { user } = {}) {
  if (!razorpay.verifyPaymentSignature({ orderId, paymentId, signature })) {
    throw ApiError.badRequest('Payment verification failed. If money was debited, it will be confirmed automatically or refunded.', { code: 'BAD_SIGNATURE' });
  }
  const order = await Order.findOne({ 'payment.razorpayOrderId': orderId });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.user && user && String(order.user) !== String(user._id)) throw ApiError.forbidden();

  // Defence in depth: confirm amount/status with Razorpay when reachable.
  let rzpPayment = null;
  try {
    rzpPayment = await razorpay.fetchPayment(paymentId);
  } catch (err) {
    logger.warn({ err: err.message }, 'Could not fetch payment from Razorpay; relying on verified signature');
  }
  if (rzpPayment) {
    if (rzpPayment.order_id !== orderId || Number(rzpPayment.amount) !== order.pricing.grandTotal) {
      logger.error({ orderId, paymentId }, 'Payment amount/order mismatch');
      throw ApiError.badRequest('Payment details do not match this order. Our team has been alerted.', { code: 'PAYMENT_MISMATCH' });
    }
    if (rzpPayment.status === 'failed') throw ApiError.badRequest('The payment failed. Please try again.', { code: 'PAYMENT_FAILED' });
  }
  const result = await markPaid(order, { razorpayPaymentId: paymentId, method: rzpPayment?.method, via: 'signature', rzpPayment });
  return result.order;
}

async function recordClientFailure({ razorpay_order_id: orderId, code, description, reason }) {
  const payment = await Payment.findOne({ razorpayOrderId: orderId });
  if (!payment || payment.status === 'captured') return;
  await Payment.updateOne(
    { _id: payment._id, status: { $ne: 'captured' } },
    { $set: { errorCode: code, errorDescription: String(description || '').slice(0, 300), errorReason: reason }, $inc: { attempts: 1 }, $push: { events: { type: 'client.failure', note: String(description || code || '').slice(0, 200) } } }
  );
}

// ---------------- webhooks ----------------

async function handleWebhook(rawBody, signature, eventIdHeader) {
  if (!razorpay.verifyWebhookSignature(rawBody, signature)) throw ApiError.badRequest('Invalid webhook signature', { code: 'BAD_SIGNATURE' });
  const payload = JSON.parse(rawBody.toString('utf8'));
  const eventId = eventIdHeader || crypto.createHash('sha256').update(rawBody).digest('hex');

  try {
    await WebhookEvent.create({ eventId, type: payload.event, payloadHash: crypto.createHash('sha256').update(rawBody).digest('hex') });
  } catch (err) {
    if (err.code === 11000) {
      const prev = await WebhookEvent.findOne({ eventId });
      if (prev?.status !== 'failed') return { duplicate: true };
      await WebhookEvent.updateOne({ eventId }, { $set: { status: 'processing' } });
    } else throw err;
  }

  try {
    const result = await processEvent(payload);
    await WebhookEvent.updateOne({ eventId }, { $set: { status: result === 'ignored' ? 'ignored' : 'processed', processedAt: new Date() } });
    return { processed: true, result };
  } catch (err) {
    await WebhookEvent.updateOne({ eventId }, { $set: { status: 'failed', error: err.message } });
    throw err; // non-2xx makes Razorpay retry
  }
}

async function processEvent(payload) {
  const ev = payload.event;
  const p = payload.payload?.payment?.entity;
  const r = payload.payload?.refund?.entity;

  if (ev === 'payment.captured' || ev === 'order.paid' || ev === 'payment.authorized') {
    const orderId = p?.order_id || payload.payload?.order?.entity?.id;
    const order = await Order.findOne({ 'payment.razorpayOrderId': orderId });
    if (!order) return 'ignored';
    if (ev === 'payment.authorized' && p?.status !== 'captured') {
      await Payment.updateOne({ razorpayOrderId: orderId, status: 'created' }, { $set: { status: 'authorized', razorpayPaymentId: p.id }, $push: { events: { type: ev } } });
      return 'authorized';
    }
    if (p && Number(p.amount) !== order.pricing.grandTotal) {
      logger.error({ orderId, amount: p.amount }, 'Webhook amount mismatch — not marking paid');
      return 'amount_mismatch';
    }
    await markPaid(order, { razorpayPaymentId: p?.id, method: p?.method, via: 'webhook', rzpPayment: p });
    return 'paid';
  }

  if (ev === 'payment.failed') {
    await Payment.updateOne(
      { razorpayOrderId: p?.order_id, status: { $nin: ['captured', 'refunded', 'partially_refunded'] } },
      { $set: { status: 'failed', razorpayPaymentId: p?.id, errorCode: p?.error_code, errorDescription: p?.error_description, errorReason: p?.error_reason }, $inc: { attempts: 1 }, $push: { events: { type: ev } } }
    );
    // the order stays pending so the shopper can retry until the hold expires
    await Order.updateOne({ 'payment.razorpayOrderId': p?.order_id, status: 'pending_payment' }, { $set: { 'payment.status': 'failed' } });
    return 'failed';
  }

  if (ev === 'refund.processed' || ev === 'refund.failed' || ev === 'refund.created') {
    const refund = await Refund.findOne({ razorpayRefundId: r?.id });
    if (!refund) return 'ignored';
    const status = ev === 'refund.processed' ? 'processed' : ev === 'refund.failed' ? 'failed' : refund.status;
    if (refund.status !== status) {
      refund.status = status;
      if (status === 'processed') refund.processedAt = new Date();
      await refund.save();
      if (status === 'processed' && refund.returnRequest) {
        await ReturnRequest.updateOne({ _id: refund.returnRequest, status: 'refund_initiated' }, { $set: { status: 'refunded' }, $push: { history: { status: 'refunded', note: 'Refund processed by Razorpay' } } });
      }
      const order = await Order.findById(refund.order);
      if (order) await email.send('refund_update', order.email, { order: order.toObject(), refund: refund.toObject() });
    }
    return 'refund_updated';
  }
  return 'ignored';
}

// ---------------- reconciliation & expiry ----------------

/** Look up a pending order at Razorpay and mark it paid if a captured payment exists. */
async function reconcileOrder(order) {
  if (!order.payment?.razorpayOrderId) return 'no_rzp_order';
  let payments;
  try {
    payments = await razorpay.fetchOrderPayments(order.payment.razorpayOrderId);
  } catch (err) {
    logger.warn({ err: err.message, order: order.orderNumber }, 'Reconcile: Razorpay unreachable');
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
    const rec = env.razorpayConfigured ? await reconcileOrder(order) : 'not_configured';
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

module.exports = { markPaid, confirmCod, afterConfirmed, verifyCheckoutPayment, recordClientFailure, handleWebhook, processEvent, reconcileOrder, expireStaleOrders };
