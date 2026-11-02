'use strict';

/**
 * Inventory with oversell protection that does NOT depend on transactions.
 *
 * Each variant keeps three counters:  stock (on hand), reserved (held by unpaid orders), available = stock - reserved.
 * Every change is a single atomic, conditional findOneAndUpdate:
 *   reserve:  available >= qty   →  available -= qty, reserved += qty
 *   release:  reserved >= qty    →  reserved -= qty,  available += qty
 *   commit:   reserved >= qty    →  reserved -= qty,  stock -= qty          (payment captured)
 *   restock:                        stock += qty, available += qty          (cancel after commit / return)
 *   adjust:   available + d >= 0 →  stock += d, available += d
 * Multi-line operations roll back already-applied lines if a later line fails (compensation).
 */

const { ProductVariant, Product, InventoryMovement } = require('../models');
const { ApiError } = require('../utils/http');
const logger = require('../config/logger');

async function syncProductStock(productIds) {
  const ids = [...new Set((Array.isArray(productIds) ? productIds : [productIds]).map(String))];
  for (const id of ids) {
    const variants = await ProductVariant.find({ product: id, isActive: true }).select('available trackInventory').lean();
    const availableQty = variants.reduce((s, v) => s + (v.trackInventory === false ? 9999 : v.available), 0);
    await Product.updateOne({ _id: id }, { $set: { availableQty, stockStatus: availableQty > 0 ? 'in_stock' : 'out_of_stock' } });
  }
}

async function record(variant, type, quantity, extra = {}) {
  try {
    await InventoryMovement.create({
      variant: variant._id,
      product: variant.product,
      sku: variant.sku,
      type,
      quantity,
      stockAfter: variant.stock,
      availableAfter: variant.available,
      ...extra,
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to record inventory movement');
  }
}

/** Reserve stock for order lines [{variant, quantity, name}]. Throws 409 listing unavailable lines. */
async function reserve(lines, { order } = {}) {
  const applied = [];
  const failures = [];
  for (const line of lines) {
    const v = await ProductVariant.findOneAndUpdate(
      { _id: line.variant, isActive: true, available: { $gte: line.quantity } },
      { $inc: { available: -line.quantity, reserved: line.quantity } },
      { new: true }
    );
    if (!v) {
      failures.push(line);
      break;
    }
    applied.push({ line, v });
  }
  if (failures.length) {
    for (const { line } of applied) {
      await ProductVariant.updateOne({ _id: line.variant }, { $inc: { available: line.quantity, reserved: -line.quantity } });
    }
    const f = failures[0];
    const current = await ProductVariant.findById(f.variant).select('available').lean();
    throw ApiError.conflict(
      current?.available > 0 ? `Only ${current.available} unit(s) of ${f.name || 'an item'} can be ordered right now` : `${f.name || 'An item'} is out of stock`,
      { code: 'OUT_OF_STOCK', details: [{ field: String(f.variant), message: String(current?.available ?? 0) }] }
    );
  }
  for (const { line, v } of applied) await record(v, 'reserve', line.quantity, { order, reason: 'Held for pending payment' });
  await syncProductStock(applied.map((a) => a.v.product));
}

async function release(lines, { order, reason = 'Pending payment released' } = {}) {
  const products = [];
  for (const line of lines) {
    const v = await ProductVariant.findOneAndUpdate(
      { _id: line.variant, reserved: { $gte: line.quantity } },
      { $inc: { available: line.quantity, reserved: -line.quantity } },
      { new: true }
    );
    if (v) {
      products.push(v.product);
      await record(v, 'release', -line.quantity, { order, reason });
    } else {
      logger.error({ variant: String(line.variant), order: String(order) }, 'Release skipped: reserved counter lower than expected');
    }
  }
  await syncProductStock(products);
}

/** Payment captured: convert the reservation into a sale (stock leaves the warehouse count). */
async function commit(lines, { order } = {}) {
  const products = [];
  for (const line of lines) {
    let v = await ProductVariant.findOneAndUpdate(
      { _id: line.variant, reserved: { $gte: line.quantity } },
      { $inc: { reserved: -line.quantity, stock: -line.quantity } },
      { new: true }
    );
    if (!v) {
      // Reservation had expired (late payment). Take it from available stock if possible.
      v = await ProductVariant.findOneAndUpdate(
        { _id: line.variant, available: { $gte: line.quantity } },
        { $inc: { available: -line.quantity, stock: -line.quantity } },
        { new: true }
      );
      if (!v) {
        logger.error({ order: String(order), variant: String(line.variant) }, 'OVERSOLD: payment captured but stock unavailable');
        await record({ _id: line.variant, product: line.product, sku: line.sku, stock: null, available: null }, 'correction', 0, { order, reason: 'OVERSOLD — manual action required' });
        continue;
      }
    }
    products.push(v.product);
    await record(v, 'sale', -line.quantity, { order, reason: 'Order paid' });
  }
  await syncProductStock(products);
}

async function restock(lines, { order, type = 'restock_cancel', reason, actor } = {}) {
  const products = [];
  for (const line of lines) {
    if (!line.quantity) continue;
    const v = await ProductVariant.findOneAndUpdate({ _id: line.variant }, { $inc: { stock: line.quantity, available: line.quantity } }, { new: true });
    if (v) {
      products.push(v.product);
      await record(v, type, line.quantity, { order, reason, actor });
    }
  }
  await syncProductStock(products);
}

/** Admin stock adjustment with mandatory reason. delta may be negative. */
async function adjust(variantId, delta, { reason, actor, type = 'adjustment' }) {
  if (!Number.isInteger(delta) || delta === 0) throw ApiError.badRequest('Adjustment must be a non-zero whole number');
  if (!reason || reason.trim().length < 3) throw ApiError.badRequest('A reason is required for stock adjustments');
  const filter = { _id: variantId };
  if (delta < 0) filter.available = { $gte: -delta };
  const v = await ProductVariant.findOneAndUpdate(filter, { $inc: { stock: delta, available: delta } }, { new: true });
  if (!v) throw ApiError.conflict('Cannot remove more units than are available (some may be reserved by unpaid orders)');
  await record(v, type, delta, { reason, actor });
  await syncProductStock(v.product);
  return v;
}

/** Set absolute on-hand stock (e.g. after a physical count). */
async function setStock(variantId, newStock, { reason, actor }) {
  const v = await ProductVariant.findById(variantId);
  if (!v) throw ApiError.notFound('Variant not found');
  if (!Number.isInteger(newStock) || newStock < v.reserved) throw ApiError.badRequest(`Stock cannot be lower than the ${v.reserved} unit(s) reserved by unpaid orders`);
  const delta = newStock - v.stock;
  if (delta === 0) return v;
  return adjust(variantId, delta, { reason, actor, type: 'correction' });
}

module.exports = { reserve, release, commit, restock, adjust, setStock, syncProductStock };
