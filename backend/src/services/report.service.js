'use strict';

/**
 * Dashboard metrics and reports — computed from the database, never fabricated.
 * Aggregation is done in application code over date-bounded queries so it runs on
 * MongoDB and Mongo-compatible engines alike.
 */
const { Order, User, Product, ProductVariant, Category, Payment } = require('../models');

const PAID = ['captured', 'partially_refunded', 'refunded'];
const COMPLETED = ['delivered'];
const PENDING = ['confirmed', 'processing', 'cancellation_requested'];

function range({ from, to, days = 30 }) {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - days * 86400_000);
  return { start, end };
}

function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

async function dashboard(params = {}) {
  const { start, end } = range(params);
  const inRange = { createdAt: { $gte: start, $lte: end } };

  const [orders, payments, customersTotal, newCustomers, lowStock, outOfStock, recent, categories] = await Promise.all([
    Order.find({ ...inRange, status: { $nin: ['expired'] } }).select('status payment pricing items placedAt createdAt orderNumber customerName').lean(),
    Payment.find(inRange).select('status').lean(),
    User.countDocuments({ role: 'customer', status: { $ne: 'deleted' } }),
    User.countDocuments({ role: 'customer', ...inRange }),
    ProductVariant.find({ isActive: true, trackInventory: { $ne: false }, available: { $gt: 0 } }).populate('product', 'name slug status lowStock').lean(),
    Product.find({ status: 'published', stockStatus: 'out_of_stock' }).select('name slug sku').lean(),
    Order.find({ status: { $nin: ['expired'] } }).sort({ createdAt: -1 }).limit(10).select('orderNumber customerName email status pricing.grandTotal payment.status createdAt').lean(),
    Category.find().select('name').lean(),
  ]);

  const paid = orders.filter((o) => PAID.includes(o.payment?.status));
  const gross = paid.reduce((s, o) => s + (o.payment.amountPaid || o.pricing.grandTotal), 0);
  const refunded = paid.reduce((s, o) => s + (o.payment.amountRefunded || 0), 0);
  const revenue = gross - refunded;

  // revenue trend by day (paid orders, by payment date)
  const trendMap = new Map();
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400_000)) trendMap.set(dayKey(d), { date: dayKey(d), revenue: 0, orders: 0 });
  for (const o of paid) {
    const k = dayKey(o.placedAt || o.createdAt);
    const row = trendMap.get(k);
    if (row) {
      row.revenue += (o.payment.amountPaid || 0) - (o.payment.amountRefunded || 0);
      row.orders += 1;
    }
  }

  // top products & sales by category (from order snapshots)
  const productIds = [...new Set(paid.flatMap((o) => o.items.map((i) => String(i.product))))];
  const productDocs = await Product.find({ _id: { $in: productIds } }).select('category name slug').lean();
  const prodCat = new Map(productDocs.map((p) => [String(p._id), String(p.category)]));
  const catName = new Map(categories.map((c) => [String(c._id), c.name]));
  const top = new Map();
  const byCat = new Map();
  for (const o of paid) {
    for (const i of o.items) {
      const k = String(i.product);
      const t = top.get(k) || { productId: k, name: i.name, sku: i.sku, units: 0, revenue: 0 };
      t.units += i.quantity - (i.quantityRefunded || 0);
      t.revenue += i.netTotal;
      top.set(k, t);
      const cn = catName.get(prodCat.get(k)) || 'Uncategorised';
      byCat.set(cn, (byCat.get(cn) || 0) + i.netTotal);
    }
  }

  const low = lowStock.filter((v) => v.product?.status === 'published' && v.available <= (v.lowStockThreshold ?? 5));
  const attempts = payments.length;
  const succeeded = payments.filter((p) => PAID.includes(p.status)).length;
  const failed = payments.filter((p) => p.status === 'failed').length;

  return {
    range: { from: start, to: end },
    revenue,
    grossRevenue: gross,
    refunded,
    ordersPlaced: paid.length,
    pendingOrders: orders.filter((o) => PENDING.includes(o.status)).length,
    completedOrders: orders.filter((o) => COMPLETED.includes(o.status)).length,
    cancelledOrders: orders.filter((o) => o.status === 'cancelled').length,
    averageOrderValue: paid.length ? Math.round(gross / paid.length) : 0,
    customers: { total: customersTotal, new: newCustomers },
    topProducts: [...top.values()].sort((a, b) => b.units - a.units).slice(0, 8),
    lowStock: low.map((v) => ({ variantId: String(v._id), sku: v.sku, name: v.product.name, available: v.available, threshold: v.lowStockThreshold })).slice(0, 20),
    outOfStock: outOfStock.map((p) => ({ productId: String(p._id), sku: p.sku, name: p.name, slug: p.slug })),
    recentOrders: recent.map((o) => ({ id: String(o._id), orderNumber: o.orderNumber, customer: o.customerName, email: o.email, status: o.status, total: o.pricing?.grandTotal, paymentStatus: o.payment?.status, createdAt: o.createdAt })),
    revenueTrend: [...trendMap.values()],
    salesByCategory: [...byCat.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    payments: { attempts, succeeded, failed, successRate: attempts ? Math.round((succeeded / attempts) * 1000) / 10 : null, failureRate: attempts ? Math.round((failed / attempts) * 1000) / 10 : null },
  };
}

/** Flat sales report rows (one per order line) for CSV export. */
async function salesRows(params = {}) {
  const { start, end } = range(params);
  const orders = await Order.find({ placedAt: { $gte: start, $lte: end }, 'payment.status': { $in: PAID } }).sort({ placedAt: 1 }).lean();
  const rows = [];
  for (const o of orders) {
    for (const i of o.items) {
      rows.push({
        date: (o.placedAt || o.createdAt).toISOString().slice(0, 10),
        orderNumber: o.orderNumber,
        invoice: o.invoice?.number || '',
        customer: o.customerName,
        state: o.shippingAddress?.state,
        sku: i.sku,
        item: i.name,
        hsn: i.hsnCode || '',
        qty: i.quantity,
        gstRate: i.gstRate,
        taxable: (i.taxableValue / 100).toFixed(2),
        tax: (i.taxAmount / 100).toFixed(2),
        total: (i.netTotal / 100).toFixed(2),
        supply: o.pricing.supplyType,
        status: o.status,
      });
    }
  }
  return rows;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const head = Object.keys(rows[0]);
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s;
  };
  return [head.join(','), ...rows.map((r) => head.map((h) => cell(r[h])).join(','))].join('\n');
}

module.exports = { dashboard, salesRows, toCsv, range };
