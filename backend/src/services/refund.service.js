'use strict';

const { Order, Payment, Refund, ReturnRequest, nextSequence } = require('../models');
const { ApiError } = require('../utils/http');
const logger = require('../config/logger');
const ccavenue = require('./ccavenue.service');
const inventory = require('./inventory.service');
const orders = require('./order.service');
const email = require('./email.service');
const { ORDER_STATUS: S } = require('../shared');

/**
 * Initiate a refund through CCAvenue. Idempotent per idempotencyKey.
 * items: [{ orderItem, quantity }] — used for restocking and per-line refund tracking.
 */
async function createRefund(orderId, { amount, reason, items = [], restock = false, idempotencyKey, returnRequest, manualReference }, actor) {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  if (!['captured', 'partially_refunded'].includes(order.payment.status)) throw ApiError.conflict('Only paid orders can be refunded', { code: 'NOT_PAID' });

  if (idempotencyKey) {
    const prior = await Refund.findOne({ idempotencyKey });
    if (prior) return { refund: prior, order, replay: true };
  }
  const refundable = order.payment.amountPaid - (order.payment.amountRefunded || 0);
  const amt = Math.round(Number(amount));
  if (!Number.isInteger(amt) || amt < 100) throw ApiError.badRequest('Refund amount must be at least ₹1');
  if (amt > refundable) throw ApiError.badRequest(`Refund cannot exceed the refundable balance of ₹${(refundable / 100).toFixed(2)}`, { code: 'REFUND_TOO_LARGE' });

  // reserve the amount on the order first (prevents two concurrent refunds exceeding the paid amount)
  const reserved = await Order.findOneAndUpdate(
    { _id: order._id, 'payment.amountRefunded': order.payment.amountRefunded || 0 },
    { $inc: { 'payment.amountRefunded': amt } },
    { new: true }
  );
  if (!reserved) throw ApiError.conflict('Another refund is being processed for this order. Refresh and try again.', { code: 'REFUND_RACE' });

  const payment = await Payment.findOne({ order: order._id, status: { $in: ['captured', 'partially_refunded'] } });
  const isCod = order.payment.provider === 'cod';
  const refund = await Refund.create({ order: order._id, payment: payment?._id, amount: amt, reason, items, restock, idempotencyKey, returnRequest, initiatedBy: actor?._id, status: isCod ? 'processed' : 'pending', mode: isCod ? 'manual' : 'razorpay', manualReference: manualReference || undefined, processedAt: isCod ? new Date() : undefined });

  // cash-on-delivery orders have no card/UPI payment to reverse: the store pays the customer by
  // bank transfer / UPI and records the reference; everything else below is the same
  if (!isCod) try {
    const seq = await nextSequence('refund');
    const rz = await ccavenue.refund(order.payment.razorpayPaymentId, { amount: amt, receipt: `RF${seq}` });
    refund.razorpayRefundId = rz.id;
    refund.status = rz.status === 'processed' ? 'processed' : 'pending';
    if (refund.status === 'processed') refund.processedAt = new Date();
    await refund.save();
  } catch (err) {
    logger.error({ err: err.message, order: order.orderNumber }, 'CCAvenue refund failed');
    refund.status = 'failed';
    refund.failureReason = err?.error?.description || err.message;
    await refund.save();
    await Order.updateOne({ _id: order._id }, { $inc: { 'payment.amountRefunded': -amt } });
    throw ApiError.badRequest(`Refund failed at CCAvenue: ${refund.failureReason}`, { code: 'REFUND_FAILED' });
  }

  const fullyRefunded = reserved.payment.amountRefunded >= reserved.payment.amountPaid;
  const payStatus = fullyRefunded ? 'refunded' : 'partially_refunded';
  await Order.updateOne({ _id: order._id }, { $set: { 'payment.status': payStatus } });
  if (payment) await Payment.updateOne({ _id: payment._id }, { $set: { status: payStatus }, $inc: { amountRefunded: amt }, $push: { events: { type: 'refund.created', note: refund.razorpayRefundId } } });

  // per-line tracking + optional restock
  if (items.length) {
    const fresh = await Order.findById(order._id);
    const toRestock = [];
    for (const it of items) {
      const line = fresh.items.id(it.orderItem);
      if (!line) continue;
      line.quantityRefunded = Math.min(line.quantity, (line.quantityRefunded || 0) + it.quantity);
      if (restock) toRestock.push({ variant: line.variant, product: line.product, sku: line.sku, quantity: it.quantity });
    }
    await fresh.save();
    if (toRestock.length) await inventory.restock(toRestock, { order: order._id, type: returnRequest ? 'restock_return' : 'restock_cancel', reason: reason || 'Refund', actor: actor?._id });
  }

  // order status follows returns; cancelled orders keep "cancelled"
  const latest = await Order.findById(order._id);
  if (latest.status === S.RETURNED) await orders.transition(latest, fullyRefunded ? S.REFUNDED : S.PARTIALLY_REFUNDED, { actorType: 'system', actor, note: `Refund ${refund.razorpayRefundId || refund.manualReference || 'manual'}` });

  await email.send('refund_update', latest.email, { order: latest.toObject(), refund: refund.toObject() });
  return { refund, order: await Order.findById(order._id) };
}

// ---------------- cancellations ----------------

/**
 * Cancel an order. Paid orders are refunded in full; committed stock is restocked if not dispatched.
 * Customers may cancel free of charge before dispatch (fix plan appendix); once processing starts,
 * a customer request becomes "cancellation requested" for an admin to approve.
 */
async function cancelOrder(order, { reason, actor, actorType = 'admin' }) {
  if (actorType === 'customer' && order.status === S.PROCESSING) {
    const updated = await orders.transition(order, S.CANCELLATION_REQUESTED, { actorType: 'customer', actor, note: reason, set: { cancellation: { requestedAt: new Date(), reason, by: 'customer' } } });
    await email.notifyAdmins(`Cancellation requested for ${order.orderNumber}`, [reason || 'No reason given']).catch(() => {});
    return { order: updated, requested: true };
  }
  const allowed = actorType === 'customer' ? [S.CONFIRMED] : [S.PENDING_PAYMENT, S.PAYMENT_FAILED, S.CONFIRMED, S.PROCESSING, S.CANCELLATION_REQUESTED];
  if (!allowed.includes(order.status)) throw ApiError.conflict('This order can no longer be cancelled. Once delivered, you can request a return.', { code: 'CANNOT_CANCEL' });

  const wasPaid = order.payment.status === 'captured';
  const codUnpaid = order.payment?.provider === 'cod' && !wasPaid;
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    {
      $set: { status: S.CANCELLED, 'cancellation.reason': reason, 'cancellation.approvedAt': new Date(), 'cancellation.by': actorType },
      $push: { statusHistory: { from: order.status, to: S.CANCELLED, at: new Date(), by: actor?._id, byName: actor?.name, byRole: actor?.role || actorType, note: reason } },
    },
    { new: true }
  );
  if (!updated) throw ApiError.conflict('The order was updated by someone else. Refresh and try again.');
  await require('./shiprocket-sync.service').onCancelled(updated);

  if (codUnpaid) {
    // nothing was paid: put the stock back and free the coupon
    await orders.restockOrder(updated, { reason: `Cancelled: ${reason || ''}`, actor });
    await require('./coupon.service').release(order._id, { includeUsed: true });
    await email.send('order_cancelled', updated.email, { order: updated.toObject(), reason, refundAmount: 0 });
    return { order: await Order.findById(updated._id), refund: null };
  }

  if (!wasPaid) {
    if (order.inventory?.reserved && !order.inventory?.released) {
      await inventory.release(order.items.map((i) => ({ variant: i.variant, quantity: i.quantity })), { order: order._id, reason: 'Order cancelled before payment' });
      await Order.updateOne({ _id: order._id }, { $set: { 'inventory.released': true } });
    }
    const coupon = require('./coupon.service');
    await coupon.release(order._id);
    return { order: updated, refund: null };
  }

  await orders.restockOrder(updated, { reason: `Cancelled: ${reason || ''}`, actor });
  let refundResult = null;
  const refundable = updated.payment.amountPaid - (updated.payment.amountRefunded || 0);
  if (refundable > 0) {
    refundResult = await createRefund(updated._id, { amount: refundable, reason: `Order cancelled${reason ? ': ' + reason : ''}`, idempotencyKey: `cancel-${updated._id}` }, actor);
  }
  await email.send('order_cancelled', updated.email, { order: updated.toObject(), reason, refundAmount: refundable });
  return { order: await Order.findById(updated._id), refund: refundResult?.refund || null };
}

// ---------------- returns ----------------

async function createReturnRequest(order, { items, type, reason, description, photos }, user) {
  if (![S.DELIVERED, S.PARTIALLY_REFUNDED].includes(order.status)) throw ApiError.conflict('Returns can be requested after delivery', { code: 'NOT_DELIVERED' });
  const deliveredAt = order.deliveredAt || order.updatedAt;
  const chosen = [];
  for (const it of items) {
    const line = order.items.id(it.orderItem);
    if (!line) throw ApiError.badRequest('Invalid item');
    const windowDays = type === 'damaged_or_wrong' ? 2 : line.returnWindowDays ?? 7;
    if (Date.now() - new Date(deliveredAt).getTime() > windowDays * 86400_000) {
      throw ApiError.conflict(
        type === 'damaged_or_wrong' ? 'Damaged or wrong items must be reported within 48 hours of delivery' : `${line.name}: the ${windowDays}-day return window has closed`,
        { code: 'RETURN_WINDOW_CLOSED' }
      );
    }
    if (line.returnable === false && type !== 'damaged_or_wrong') throw ApiError.conflict(`${line.name} is non-returnable (except if damaged or wrong)`, { code: 'NON_RETURNABLE' });
    const remaining = line.quantity - (line.quantityReturned || 0) - (line.quantityRefunded || 0);
    if (it.quantity < 1 || it.quantity > remaining) throw ApiError.badRequest(`Invalid quantity for ${line.name}`);
    chosen.push({ orderItem: line._id, sku: line.sku, name: line.name, quantity: it.quantity });
  }
  const open = await ReturnRequest.findOne({ order: order._id, status: { $in: ['requested', 'approved', 'pickup_scheduled', 'received', 'refund_initiated'] } });
  if (open) throw ApiError.conflict(`Return ${open.requestNumber} is already open for this order`, { code: 'RETURN_OPEN' });

  const seq = await nextSequence('return');
  const request = await ReturnRequest.create({
    requestNumber: `RET${String(seq).padStart(6, '0')}`,
    order: order._id,
    user: user?._id,
    type,
    items: chosen,
    reason,
    description,
    photos,
    returnShippingPaidBy: type === 'damaged_or_wrong' ? 'store' : null,
    history: [{ status: 'requested', by: user?._id, note: reason }],
  });
  await orders.transition(order, S.RETURN_REQUESTED, { actorType: 'customer', actor: user, note: `Return ${request.requestNumber}` });
  await email.send('return_received', order.email, { order: order.toObject(), request: request.toObject() });
  await email.notifyAdmins(`Return requested: ${request.requestNumber}`, [`Order ${order.orderNumber}`, `${reason}`]).catch(() => {});
  return request;
}

const RETURN_FLOW = {
  requested: ['approved', 'rejected'],
  approved: ['pickup_scheduled', 'received', 'rejected'],
  pickup_scheduled: ['received'],
  received: ['refund_initiated', 'closed'],
  refund_initiated: ['refunded'],
  rejected: ['closed'],
  refunded: ['closed'],
};

async function updateReturnRequest(id, { status, adminNotes, returnShippingPaidBy, deductionAmount, restock = true }, actor) {
  const request = await ReturnRequest.findById(id);
  if (!request) throw ApiError.notFound('Return request not found');
  if (status && status !== request.status && !(RETURN_FLOW[request.status] || []).includes(status)) {
    throw ApiError.conflict(`Cannot move return from ${request.status} to ${status}`);
  }
  const order = await Order.findById(request.order);
  if (adminNotes !== undefined) request.adminNotes = adminNotes;
  if (returnShippingPaidBy) request.returnShippingPaidBy = returnShippingPaidBy;
  if (deductionAmount !== undefined) request.deductionAmount = Math.max(0, Math.round(deductionAmount));

  if (status === 'rejected' && order.status === S.RETURN_REQUESTED) await orders.transition(order, S.DELIVERED, { actor, note: `Return ${request.requestNumber} rejected` });
  if (status === 'received') {
    for (const it of request.items) {
      const line = order.items.id(it.orderItem);
      if (line) line.quantityReturned = (line.quantityReturned || 0) + it.quantity;
    }
    await order.save();
    if (order.status === S.RETURN_REQUESTED) await orders.transition(order, S.RETURNED, { actor, note: `Return ${request.requestNumber} received` });
  }
  if (status === 'refund_initiated') {
    const amount = request.items.reduce((sum, it) => {
      const line = order.items.id(it.orderItem);
      if (!line) return sum;
      const perUnit = Math.floor((line.netTotal + (request.type === 'damaged_or_wrong' ? line.packagingCharge : 0)) / line.quantity);
      return sum + perUnit * it.quantity;
    }, 0);
    const shippingBack = request.type === 'damaged_or_wrong' && order.items.every((l) => request.items.some((i) => String(i.orderItem) === String(l._id) && i.quantity === l.quantity)) ? order.pricing.shippingCharge : 0;
    const total = Math.max(0, amount + shippingBack - (request.deductionAmount || 0));
    const { refund } = await createRefund(order._id, { amount: total, reason: `Return ${request.requestNumber}`, items: request.items.map((i) => ({ orderItem: i.orderItem, quantity: i.quantity })), restock, idempotencyKey: `return-${request._id}`, returnRequest: request._id }, actor);
    request.refund = refund._id;
    if (refund.status === 'processed') status = 'refunded';
  }
  if (status) {
    request.status = status;
    request.history.push({ status, by: actor?._id, note: adminNotes });
  }
  await request.save();
  await email.send('return_update', order.email, { order: order.toObject(), request: request.toObject() });
  return request;
}

module.exports = { createRefund, cancelOrder, createReturnRequest, updateReturnRequest, RETURN_FLOW };
