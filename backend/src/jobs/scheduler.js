'use strict';

/**
 * Periodic maintenance (runs inside the API process; set RUN_SCHEDULER=false on extra instances
 * so only one instance runs these):
 *   - every 2 min: expire unpaid orders past their hold (after reconciling with CCAvenue)
 *   - every 15 min: reconcile recently-pending orders with CCAvenue (missed webhooks)
 *   - hourly: low-stock alert email (once per variant per day)
 */
const logger = require('../config/logger');
const { Order, ProductVariant } = require('../models');

const timers = [];
const alerted = new Map();

async function safe(name, fn) {
  try {
    await fn();
  } catch (err) {
    logger.error({ job: name, err: err.message }, 'Scheduled job failed');
  }
}

async function expire() {
  const payments = require('../services/payment.service');
  const results = await payments.expireStaleOrders();
  if (results.length) logger.info({ results }, 'Expired/reconciled stale orders');
}

async function reconcileRecent() {
  const env = require('../config/env');
  if (!env.ccavenueConfigured) return;
  const payments = require('../services/payment.service');
  const recent = await Order.find({ status: 'pending_payment', createdAt: { $gte: new Date(Date.now() - 2 * 3600_000), $lte: new Date(Date.now() - 5 * 60_000) } }).limit(50);
  for (const o of recent) await payments.reconcileOrder(o);
}

async function lowStock() {
  const settings = require('../services/settings.service');
  const email = require('../services/email.service');
  const n = await settings.get('notifications');
  if (!n.notifyOnLowStock) return;
  const low = await ProductVariant.find({ isActive: true, trackInventory: { $ne: false } }).populate('product', 'name status').lean();
  const today = new Date().toISOString().slice(0, 10);
  const lines = [];
  for (const v of low) {
    if (v.product?.status !== 'published' || v.available > (v.lowStockThreshold ?? 5)) continue;
    const key = `${v._id}:${today}`;
    if (alerted.has(key)) continue;
    alerted.set(key, true);
    lines.push(`${v.sku} · ${v.product.name}: ${v.available} available`);
  }
  if (lines.length) await email.notifyAdmins(`Low stock: ${lines.length} item(s)`, lines.slice(0, 40));
}

function every(ms, name, fn) {
  const t = setInterval(() => safe(name, fn), ms);
  t.unref();
  timers.push(t);
}

function start() {
  every(2 * 60_000, 'expire', expire);
  every(15 * 60_000, 'reconcile', reconcileRecent);
  every(60 * 60_000, 'lowStock', lowStock);
  logger.info('Scheduler started');
}

function stop() {
  timers.splice(0).forEach(clearInterval);
}

module.exports = { start, stop, expire, reconcileRecent, lowStock };
