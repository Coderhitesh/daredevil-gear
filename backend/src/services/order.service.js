'use strict';

const { Order, Shipment, nextSequence } = require('../models');
const { ORDER_STATUS: S, ORDER_STATUS_LABEL } = require('../shared');
const { ApiError } = require('../utils/http');
const env = require('../config/env');
const email = require('./email.service');
const inventory = require('./inventory.service');

/**
 * Order status state machine. Only transitions listed here are allowed.
 * `system` transitions are performed by payment processing / jobs, not by admins.
 */
const TRANSITIONS = {
  [S.PENDING_PAYMENT]: { system: [S.CONFIRMED, S.PAYMENT_FAILED, S.EXPIRED], admin: [S.CANCELLED], customer: [] },
  [S.PAYMENT_FAILED]: { system: [S.CONFIRMED, S.EXPIRED, S.PENDING_PAYMENT], admin: [S.CANCELLED], customer: [] },
  [S.EXPIRED]: { system: [S.CONFIRMED], admin: [], customer: [] },
  [S.CONFIRMED]: { system: [S.CANCELLED], admin: [S.PROCESSING, S.CANCELLED], customer: [S.CANCELLED] },
  [S.PROCESSING]: { system: [], admin: [S.SHIPPED, S.CANCELLED, S.CONFIRMED], customer: [S.CANCELLATION_REQUESTED] },
  [S.CANCELLATION_REQUESTED]: { system: [], admin: [S.CANCELLED, S.PROCESSING], customer: [] },
  [S.SHIPPED]: { system: [S.OUT_FOR_DELIVERY, S.DELIVERED], admin: [S.OUT_FOR_DELIVERY, S.DELIVERED], customer: [] },
  [S.OUT_FOR_DELIVERY]: { system: [S.DELIVERED], admin: [S.DELIVERED, S.SHIPPED], customer: [] },
  [S.DELIVERED]: { system: [S.RETURN_REQUESTED], admin: [S.RETURN_REQUESTED], customer: [S.RETURN_REQUESTED] },
  [S.RETURN_REQUESTED]: { system: [S.RETURNED, S.DELIVERED], admin: [S.RETURNED, S.DELIVERED], customer: [] },
  [S.RETURNED]: { system: [S.REFUNDED, S.PARTIALLY_REFUNDED], admin: [S.REFUNDED, S.PARTIALLY_REFUNDED], customer: [] },
  [S.PARTIALLY_REFUNDED]: { system: [S.REFUNDED, S.RETURN_REQUESTED], admin: [S.REFUNDED], customer: [] },
  [S.CANCELLED]: { system: [], admin: [], customer: [] },
  [S.REFUNDED]: { system: [], admin: [], customer: [] },
};

function canTransition(from, to, actorType = 'admin') {
  const t = TRANSITIONS[from];
  if (!t) return false;
  return (t[actorType] || []).includes(to);
}

/**
 * Atomically move an order between states (compare-and-set on the current status).
 * Returns the updated order or throws 409 if the order changed concurrently / the transition is illegal.
 */
async function transition(orderOrId, to, { actorType = 'admin', actor, note, set = {} } = {}) {
  const order = orderOrId._id ? orderOrId : await Order.findById(orderOrId);
  if (!order) throw ApiError.notFound('Order not found');
  const from = order.status;
  if (from === to) return order;
  if (!canTransition(from, to, actorType)) {
    throw ApiError.conflict(`Cannot change order from "${ORDER_STATUS_LABEL[from]}" to "${ORDER_STATUS_LABEL[to]}"`, { code: 'BAD_TRANSITION' });
  }
  // cash on delivery: the courier collected the amount when the parcel was delivered
  if (to === 'delivered' && order.payment?.provider === 'cod' && order.payment?.status === 'cod_pending') {
    set = { ...set, 'payment.status': 'captured', 'payment.paidAt': new Date(), 'payment.amountPaid': order.pricing.grandTotal };
  }
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: from },
    {
      $set: { status: to, ...set },
      $push: { statusHistory: { from, to, at: new Date(), by: actor?._id, byName: actor?.name, byRole: actor?.role || actorType, note } },
    },
    { new: true }
  );
  if (!updated) throw ApiError.conflict('The order was updated by someone else. Refresh and try again.', { code: 'STALE_ORDER' });
  return updated;
}

function orderUrl(order) {
  return `${env.STOREFRONT_URL}/account/orders/${order.orderNumber}`;
}

async function generateOrderNumber() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const seq = await nextSequence(`order-${ymd}`);
  return `DDG${ymd}${String(seq).padStart(4, '0')}`;
}

async function assignInvoiceNumber(order) {
  if (order.invoice?.number) return order;
  const d = order.placedAt || new Date();
  const fyStart = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const fy = `${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}`;
  const seq = await nextSequence(`invoice-${fy}`);
  const number = `DDG/${fy}/${String(seq).padStart(5, '0')}`;
  return Order.findOneAndUpdate({ _id: order._id, 'invoice.number': { $exists: false } }, { $set: { invoice: { number, generatedAt: new Date() } } }, { new: true }).then((o) => o || Order.findById(order._id));
}

// ---------------- shipments ----------------

async function createShipment(order, { carrier, trackingNumber, trackingUrl, method, note }, actor) {
  if (![S.CONFIRMED, S.PROCESSING].includes(order.status)) throw ApiError.conflict('Only confirmed or processing orders can be shipped');
  if (order.status === S.CONFIRMED) order = await transition(order, S.PROCESSING, { actor, note: 'Moved to processing for dispatch' });
  const shipment = await Shipment.create({
    order: order._id,
    provider: 'manual',
    carrier,
    trackingNumber,
    trackingUrl,
    method,
    status: 'shipped',
    shippedAt: new Date(),
    events: [{ status: 'shipped', note: note || `Dispatched${carrier ? ' via ' + carrier : ''}` }],
  });
  const updated = await transition(order, S.SHIPPED, { actor, note: `Shipped${trackingNumber ? ' — ' + trackingNumber : ''}`, set: { shipment: shipment._id } });
  await email.send('shipment_dispatched', updated.email, { order: updated.toObject(), shipment: shipment.toObject(), orderUrl: orderUrl(updated) });
  updated.notifications.push({ type: 'shipment_dispatched', to: updated.email, status: 'queued' });
  await updated.save();
  return { order: updated, shipment };
}

async function updateShipment(order, { status, location, note, trackingNumber, trackingUrl, carrier }, actor) {
  const shipment = await Shipment.findById(order.shipment);
  if (!shipment) throw ApiError.notFound('No shipment for this order');
  if (trackingNumber) shipment.trackingNumber = trackingNumber;
  if (trackingUrl) shipment.trackingUrl = trackingUrl;
  if (carrier) shipment.carrier = carrier;
  let updated = order;
  if (status && status !== shipment.status) {
    shipment.status = status;
    shipment.events.push({ status, location, note });
    if (status === 'delivered') shipment.deliveredAt = new Date();
    const map = { out_for_delivery: S.OUT_FOR_DELIVERY, delivered: S.DELIVERED };
    if (map[status] && order.status !== map[status]) {
      updated = await transition(order, map[status], { actor, note, set: status === 'delivered' ? { deliveredAt: new Date() } : {} });
      const tpl = status === 'delivered' ? 'order_delivered' : 'shipment_update';
      await email.send(tpl, updated.email, { order: updated.toObject(), status: updated.status, orderUrl: orderUrl(updated) });
    }
  } else if (location || note) {
    shipment.events.push({ status: shipment.status, location, note });
  }
  await shipment.save();
  return { order: updated, shipment };
}

/** Restock committed inventory for the unshipped/returned quantities. Idempotent via order.inventory.restocked. */
async function restockOrder(order, { reason, actor, type = 'restock_cancel' }) {
  if (!order.inventory?.committed || order.inventory?.restocked) return;
  const lines = order.items.map((i) => ({ variant: i.variant, product: i.product, sku: i.sku, quantity: i.quantity }));
  const marked = await Order.findOneAndUpdate({ _id: order._id, 'inventory.restocked': { $ne: true } }, { $set: { 'inventory.restocked': true } });
  if (!marked) return;
  await inventory.restock(lines, { order: order._id, reason, actor: actor?._id, type });
}

module.exports = { TRANSITIONS, canTransition, transition, orderUrl, generateOrderNumber, assignInvoiceNumber, createShipment, updateShipment, restockOrder };
