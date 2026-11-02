'use strict';

/**
 * Pushes paid orders to Shiprocket.
 *  - queued from payment.markPaid() when Admin → Settings → Shiprocket → "Send paid orders automatically" is on
 *  - idempotent: an order that already has a Shiprocket order id is never created twice; before re-trying a
 *    create that failed with a network error we look the order up in Shiprocket first
 *  - retries with exponential back-off (job queue); the last error is shown on the admin order page
 */
const queue = require('../jobs/queue');
const logger = require('../config/logger');
const settings = require('./settings.service');
const sr = require('./shipping-provider.service');
const { Order } = require('../models');

const JOB = 'shiprocket.push';
const PUSHABLE = ['confirmed', 'processing'];

async function enqueue(orderId, { delay } = {}) {
  await Order.updateOne({ _id: orderId, 'shiprocket.status': { $in: [null, 'not_sent', 'failed'] } }, { $set: { 'shiprocket.status': 'queued' } });
  await queue.enqueue(JOB, { orderId: String(orderId) }, { jobId: `sr-${orderId}-${Date.now()}`, ...(delay ? { delay } : {}) });
}

/** Called after a payment is captured. Never throws (payment flow must not fail because of shipping). */
async function onPaid(order) {
  try {
    if (!sr.enabled()) return;
    const cfg = await settings.get('shiprocket');
    if (!cfg.autoPush) return;
    await enqueue(order._id);
  } catch (err) {
    logger.error({ order: order.orderNumber, err: err.message }, 'Could not queue Shiprocket push');
  }
}

/**
 * Create the order in Shiprocket (and optionally assign the quoted courier).
 * Returns the updated order. Throws on failure so the job is retried.
 */
async function push(orderId, { force = false } = {}) {
  const order = await Order.findById(orderId);
  if (!order) return null;
  if (!PUSHABLE.includes(order.status) && !force) {
    await Order.updateOne({ _id: order._id }, { $set: { 'shiprocket.status': order.status === 'cancelled' ? 'cancelled' : order.shiprocket?.status || 'not_sent', 'shiprocket.lastError': `Not sent: order is ${order.status}` } });
    return order;
  }
  const cfg = await settings.get('shiprocket');
  const now = new Date();
  await Order.updateOne({ _id: order._id }, { $set: { 'shiprocket.lastTriedAt': now }, $inc: { 'shiprocket.attempts': 1 } });

  try {
    let info = order.shiprocket?.orderId ? { orderId: order.shiprocket.orderId, shipmentId: order.shiprocket.shipmentId, awb: order.shiprocket.awb } : null;
    // a previous attempt may have reached Shiprocket even though we did not get the answer
    if (!info && (order.shiprocket?.attempts || 0) > 0) info = await sr.findOrder(order.orderNumber).catch(() => null);
    if (!info) info = await sr.createOrder(order, cfg);

    const set = {
      'shiprocket.status': info.awb ? 'awb_assigned' : 'pushed',
      'shiprocket.orderId': info.orderId,
      'shiprocket.shipmentId': info.shipmentId || undefined,
      'shiprocket.awb': info.awb || undefined,
      'shiprocket.courierName': info.courierName || undefined,
      'shiprocket.pushedAt': order.shiprocket?.pushedAt || now,
      'shiprocket.lastError': '',
    };
    await Order.updateOne({ _id: order._id }, { $set: set });

    if (cfg.autoAssignCourier && !info.awb && info.shipmentId) {
      try {
        const awb = await sr.assignAwb(info.shipmentId, order.delivery?.courierId);
        await Order.updateOne({ _id: order._id }, { $set: { 'shiprocket.status': 'awb_assigned', 'shiprocket.awb': awb.awb, 'shiprocket.courierName': awb.courierName || order.delivery?.courierName } });
      } catch (err) {
        // the order is in Shiprocket; the courier can be assigned from the Shiprocket panel or the admin order page
        await Order.updateOne({ _id: order._id }, { $set: { 'shiprocket.lastError': `Order sent, courier not assigned: ${err.message}` } });
      }
    }
    logger.info({ order: order.orderNumber, shiprocketOrder: info.orderId }, 'Order pushed to Shiprocket');
    return Order.findById(order._id);
  } catch (err) {
    await Order.updateOne({ _id: order._id }, { $set: { 'shiprocket.status': 'failed', 'shiprocket.lastError': String(err.message || err).slice(0, 500) } });
    logger.error({ order: order.orderNumber, err: err.message }, 'Shiprocket push failed');
    if (err.retryable === false || (err.status && err.status < 500 && err.status !== 429)) {
      // validation problems (bad pincode, pickup location name…) will not fix themselves: stop retrying
      return Order.findById(order._id);
    }
    throw err;
  }
}

/** Cancel the Shiprocket order when the store order is cancelled. Never throws. */
async function onCancelled(order) {
  try {
    if (!sr.enabled() || !order.shiprocket?.orderId || order.shiprocket.status === 'cancelled') return;
    await sr.cancelOrders([order.shiprocket.orderId]);
    await Order.updateOne({ _id: order._id }, { $set: { 'shiprocket.status': 'cancelled', 'shiprocket.lastError': '' } });
  } catch (err) {
    await Order.updateOne({ _id: order._id }, { $set: { 'shiprocket.lastError': `Cancel in Shiprocket failed — cancel it in the Shiprocket panel: ${err.message}` } }).catch(() => {});
    logger.error({ order: order.orderNumber, err: err.message }, 'Shiprocket cancel failed');
  }
}

queue.registerHandler(JOB, (job) => push(job.orderId));

module.exports = { onPaid, push, enqueue, onCancelled, JOB };
