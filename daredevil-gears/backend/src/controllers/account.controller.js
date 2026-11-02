'use strict';

const { ok, ApiError, parsePagination, pageMeta } = require('../utils/http');
const { Address, Order, ReturnRequest, Shipment, Review, Wishlist, Refund, User } = require('../models');
const { ORDER_STATUS_LABEL } = require('../shared');
const auth = require('../services/auth.service');
const refunds = require('../services/refund.service');
const reviews = require('../services/review.service');
const invoice = require('../services/invoice.service');
const tax = require('../services/tax.service');
const { COOKIES } = require('../middleware/auth');
const { clearCustomerCookies, noStore } = require('./helpers');
const { loadOrderForPayer } = require('./checkout.controller');

async function serialiseOrder(order, { includeHistory = true } = {}) {
  const [shipment, returns, refundDocs] = await Promise.all([
    order.shipment ? Shipment.findById(order.shipment).lean() : null,
    ReturnRequest.find({ order: order._id }).sort({ createdAt: -1 }).lean(),
    Refund.find({ order: order._id }).sort({ createdAt: -1 }).lean(),
  ]);
  const deliveredAt = order.deliveredAt;
  const returnableItems = ['delivered', 'partially_refunded'].includes(order.status)
    ? order.items.filter((i) => {
        const remaining = i.quantity - (i.quantityReturned || 0) - (i.quantityRefunded || 0);
        const withinWindow = deliveredAt && Date.now() - new Date(deliveredAt).getTime() <= (i.returnWindowDays ?? 7) * 86400_000;
        const damagedWindow = deliveredAt && Date.now() - new Date(deliveredAt).getTime() <= 2 * 86400_000;
        return remaining > 0 && ((i.returnable !== false && withinWindow) || damagedWindow);
      })
    : [];
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: ORDER_STATUS_LABEL[order.status],
    createdAt: order.createdAt,
    placedAt: order.placedAt,
    email: order.email,
    items: order.items.map((i) => ({
      id: String(i._id),
      productId: i.product ? String(i.product) : null,
      name: i.name,
      variantTitle: i.variantTitle,
      sku: i.sku,
      slug: i.slug,
      image: i.image,
      quantity: i.quantity,
      unitPrice: i.unitPriceInclusive,
      lineTotal: i.lineTotalInclusive,
      discount: i.discount,
      netTotal: i.netTotal,
      gstRate: i.gstRate,
      taxAmount: i.taxAmount,
      returnable: i.returnable !== false,
      quantityReturned: i.quantityReturned || 0,
      quantityRefunded: i.quantityRefunded || 0,
    })),
    pricing: order.pricing,
    shippingAddress: order.shippingAddress,
    delivery: order.delivery,
    payment: { provider: order.payment?.provider || 'razorpay', status: order.payment?.status, method: order.payment?.method, paidAt: order.payment?.paidAt, amountRefunded: order.payment?.amountRefunded || 0 },
    shipment: shipment ? { carrier: shipment.carrier, trackingNumber: shipment.trackingNumber, trackingUrl: shipment.trackingUrl, status: shipment.status, events: shipment.events, shippedAt: shipment.shippedAt, deliveredAt: shipment.deliveredAt } : null,
    history: includeHistory ? (order.statusHistory || []).map((h) => ({ status: h.to, label: ORDER_STATUS_LABEL[h.to], at: h.at, note: h.byRole === 'customer' || h.byRole === 'system' ? h.note : undefined })) : undefined,
    returns: returns.map((r) => ({ requestNumber: r.requestNumber, status: r.status, type: r.type, reason: r.reason, items: r.items, createdAt: r.createdAt, adminNotes: r.adminNotes })),
    refunds: refundDocs.map((r) => ({ amount: r.amount, status: r.status, createdAt: r.createdAt, processedAt: r.processedAt })),
    invoiceAvailable: Boolean(order.invoice?.number),
    canPay: ['pending_payment', 'payment_failed'].includes(order.status) && order.expiresAt > new Date(),
    canCancel: ['confirmed', 'processing'].includes(order.status),
    canReturn: returnableItems.length > 0 && !returns.some((r) => ['requested', 'approved', 'pickup_scheduled', 'received', 'refund_initiated'].includes(r.status)),
    returnableItemIds: returnableItems.map((i) => String(i._id)),
  };
}

async function myOrder(req) {
  if (req.user) {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber, user: req.user._id });
    if (order) return order;
  }
  return loadOrderForPayer(req, req.params.orderNumber);
}

module.exports = {
  serialiseOrder,

  // ---------------- profile ----------------
  profile: async (req, res) => {
    noStore(res);
    return ok(res, req.user.toSafeJSON());
  },

  updateProfile: async (req, res) => {
    const { name, phone, notificationPrefs } = req.body;
    if (name !== undefined) req.user.name = name;
    if (phone !== undefined) req.user.phone = phone || undefined;
    if (notificationPrefs) {
      req.user.notificationPrefs = { ...req.user.notificationPrefs.toObject?.(), ...notificationPrefs };
      if (notificationPrefs.marketing) req.user.marketingConsentAt = new Date();
    }
    await req.user.save();
    return ok(res, req.user.toSafeJSON());
  },

  changePassword: async (req, res) => {
    await auth.changePassword(req.user._id, req.body);
    clearCustomerCookies(res);
    return ok(res, { message: 'Password changed. Please sign in again.' });
  },

  sessions: async (req, res) => {
    noStore(res);
    return ok(res, await auth.listSessions(req.user._id, req.cookies?.[COOKIES.refresh]));
  },

  revokeSession: async (req, res) => {
    await auth.revokeSession(req.user._id, req.params.id);
    return ok(res, { revoked: true });
  },

  privacyRequest: async (req, res) => {
    const open = req.user.privacyRequests.find((p) => p.type === req.body.type && p.status === 'open');
    if (!open) req.user.privacyRequests.push({ type: req.body.type, note: req.body.note });
    await req.user.save();
    return ok(res, { message: 'Your request has been recorded. We will respond within 30 days.' });
  },

  exportData: async (req, res) => {
    noStore(res);
    const [addresses, orders, reviewsMine, wishlist] = await Promise.all([
      Address.find({ user: req.user._id }).lean(),
      Order.find({ user: req.user._id }).select('-guestAccessHash -ip -userAgent -internalNotes').lean(),
      Review.find({ user: req.user._id }).lean(),
      Wishlist.findOne({ user: req.user._id }).lean(),
    ]);
    const user = await User.findById(req.user._id).lean();
    delete user.passwordHash;
    delete user.mfa;
    delete user.supportNotes;
    res.set('Content-Disposition', `attachment; filename="daredevil-gears-data-${Date.now()}.json"`);
    return res.json({ exportedAt: new Date(), account: user, addresses, orders, reviews: reviewsMine, wishlist: wishlist?.products || [] });
  },

  // ---------------- addresses ----------------
  addresses: async (req, res) => {
    noStore(res);
    return ok(res, await Address.find({ user: req.user._id }).sort({ isDefaultShipping: -1, updatedAt: -1 }).lean());
  },

  createAddress: async (req, res) => {
    const count = await Address.countDocuments({ user: req.user._id });
    if (count >= 20) throw ApiError.badRequest('You can save up to 20 addresses');
    const isFirst = count === 0;
    const data = { ...req.body, user: req.user._id, isDefaultShipping: req.body.isDefaultShipping || isFirst, isDefaultBilling: req.body.isDefaultBilling || isFirst };
    if (data.isDefaultShipping) await Address.updateMany({ user: req.user._id }, { $set: { isDefaultShipping: false } });
    if (data.isDefaultBilling) await Address.updateMany({ user: req.user._id }, { $set: { isDefaultBilling: false } });
    return ok(res, await Address.create(data), undefined, 201);
  },

  updateAddress: async (req, res) => {
    const a = await Address.findOne({ _id: req.params.id, user: req.user._id });
    if (!a) throw ApiError.notFound('Address not found');
    if (req.body.isDefaultShipping) await Address.updateMany({ user: req.user._id }, { $set: { isDefaultShipping: false } });
    if (req.body.isDefaultBilling) await Address.updateMany({ user: req.user._id }, { $set: { isDefaultBilling: false } });
    Object.assign(a, req.body);
    await a.save();
    return ok(res, a);
  },

  deleteAddress: async (req, res) => {
    await Address.deleteOne({ _id: req.params.id, user: req.user._id });
    return ok(res, { deleted: true });
  },

  // ---------------- orders ----------------
  orders: async (req, res) => {
    noStore(res);
    const pg = parsePagination(req.query, { defaultLimit: 10, maxLimit: 50 });
    const filter = { user: req.user._id, status: { $ne: 'expired' } };
    const [items, total] = await Promise.all([Order.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(), Order.countDocuments(filter)]);
    return ok(
      res,
      items.map((o) => ({ orderNumber: o.orderNumber, status: o.status, statusLabel: ORDER_STATUS_LABEL[o.status], createdAt: o.createdAt, total: o.pricing.grandTotal, itemCount: o.items.reduce((s, i) => s + i.quantity, 0), firstItem: o.items[0]?.name, image: o.items[0]?.image, paymentStatus: o.payment?.status })),
      pageMeta(pg, total)
    );
  },

  order: async (req, res) => {
    noStore(res);
    return ok(res, await serialiseOrder(await myOrder(req)));
  },

  trackOrder: async (req, res) => {
    noStore(res);
    const order = await Order.findOne({ orderNumber: req.body.orderNumber.toUpperCase(), email: req.body.email.toLowerCase() }).lean();
    if (!order || order.status === 'expired') throw ApiError.notFound('We could not find an order with those details');
    const shipment = order.shipment ? await Shipment.findById(order.shipment).lean() : null;
    return ok(res, {
      orderNumber: order.orderNumber,
      status: order.status,
      statusLabel: ORDER_STATUS_LABEL[order.status],
      placedAt: order.placedAt || order.createdAt,
      itemCount: order.items.reduce((s, i) => s + i.quantity, 0),
      shipment: shipment ? { carrier: shipment.carrier, trackingNumber: shipment.trackingNumber, trackingUrl: shipment.trackingUrl, status: shipment.status, events: shipment.events } : null,
      history: order.statusHistory.map((h) => ({ status: h.to, label: ORDER_STATUS_LABEL[h.to], at: h.at })),
    });
  },

  cancel: async (req, res) => {
    const order = await myOrder(req);
    const result = await refunds.cancelOrder(order, { reason: req.body.reason, actor: req.user || { name: 'Guest', role: 'customer' }, actorType: 'customer' });
    return ok(res, { ...(await serialiseOrder(result.order)), cancellationRequested: Boolean(result.requested) });
  },

  createReturn: async (req, res) => {
    const order = await myOrder(req);
    const request = await refunds.createReturnRequest(order, req.body, req.user);
    return ok(res, { requestNumber: request.requestNumber, status: request.status }, undefined, 201);
  },

  invoice: async (req, res) => {
    const order = await myOrder(req);
    if (!order.invoice?.number) throw ApiError.notFound('Invoice is available after payment');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'private, no-store');
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
    return res.send(await invoice.renderInvoice(order.toObject(), { taxConfig: await tax.get() }));
  },

  // ---------------- reviews ----------------
  createReview: async (req, res) => ok(res, { status: (await reviews.create(req.user, req.body.productId, req.body)).status }, undefined, 201),

  reportReview: async (req, res) => {
    await reviews.report(req.params.id, req.user, req.body.reason);
    return ok(res, { reported: true });
  },

  myReviews: async (req, res) => {
    noStore(res);
    const items = await Review.find({ user: req.user._id }).populate('product', 'name slug').sort({ createdAt: -1 }).lean();
    return ok(res, items.map((r) => ({ id: String(r._id), product: r.product ? { name: r.product.name, slug: r.product.slug } : null, rating: r.rating, title: r.title, body: r.body, status: r.status, createdAt: r.createdAt })));
  },
};
