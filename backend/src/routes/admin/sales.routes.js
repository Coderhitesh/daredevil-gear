'use strict';

const router = require('express').Router();
const { asyncHandler: h, ok, ApiError, parsePagination, pageMeta } = require('../../utils/http');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/auth');
const { audit } = require('../../services/audit.service');
const { Order, Payment, Refund, ReturnRequest, Shipment, User, Address, Review, Coupon, CouponRedemption, EmailLog, Session, Wishlist } = require('../../models');
const orders = require('../../services/order.service');
const refunds = require('../../services/refund.service');
const payments = require('../../services/payment.service');
const reviews = require('../../services/review.service');
const invoice = require('../../services/invoice.service');
const tax = require('../../services/tax.service');
const email = require('../../services/email.service');
const shippingProvider = require('../../services/shipping-provider.service');
const { toCsv } = require('../../services/report.service');
const { escapeRegex } = require('../../utils/text');
const { crud } = require('./crud');
const { z, objectId, paise, safeText } = require('../../validators/schemas');
const { ORDER_STATUS } = require('../../shared');

const idParams = z.object({ id: objectId });

async function loadOrder(id) {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

// ---------------- orders ----------------

router.get(
  '/orders',
  requirePermission('orders:read'),
  h(async (req, res) => {
    const pg = parsePagination(req.query, { defaultLimit: 25, maxLimit: 200 });
    const filter = {};
    if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
    else if (req.query.includeExpired !== 'true') filter.status = { $ne: 'expired' };
    if (req.query.payment) filter['payment.status'] = String(req.query.payment);
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(`${req.query.to}T23:59:59`);
    }
    if (req.query.q) {
      const rx = { $regex: escapeRegex(String(req.query.q).slice(0, 80)), $options: 'i' };
      filter.$or = [{ orderNumber: rx }, { email: rx }, { customerName: rx }, { phone: rx }, { 'payment.razorpayPaymentId': rx }, { 'items.sku': rx }];
    }
    const [items, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).select('orderNumber customerName email phone status payment.status pricing.grandTotal items.quantity createdAt placedAt isGuest shippingAddress.city shippingAddress.state').lean(),
      Order.countDocuments(filter),
    ]);
    return ok(res, items.map((o) => ({ ...o, itemCount: o.items.reduce((s, i) => s + i.quantity, 0), items: undefined })), pageMeta(pg, total));
  })
);

router.get('/orders/export', requirePermission('reports:read'), h(async (req, res) => {
  const filter = { status: { $ne: 'expired' } };
  if (req.query.from) filter.createdAt = { $gte: new Date(req.query.from) };
  const list = await Order.find(filter).sort({ createdAt: -1 }).limit(10000).lean();
  const rows = list.map((o) => ({ orderNumber: o.orderNumber, date: o.createdAt.toISOString(), customer: o.customerName, email: o.email, phone: o.phone, status: o.status, payment: o.payment?.status, total: (o.pricing.grandTotal / 100).toFixed(2), tax: (o.pricing.taxTotal / 100).toFixed(2), shipping: (o.pricing.shippingCharge / 100).toFixed(2), coupon: o.pricing.couponCode || '', city: o.shippingAddress?.city, state: o.shippingAddress?.state, invoice: o.invoice?.number || '' }));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="ddg-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(toCsv(rows));
}));

router.get(
  '/orders/:id',
  requirePermission('orders:read'),
  validate({ params: idParams }),
  h(async (req, res) => {
    const order = await Order.findById(req.params.id).populate('user', 'name email phone status').lean();
    if (!order) throw ApiError.notFound('Order not found');
    delete order.guestAccessHash;
    const [paymentDocs, refundDocs, returnDocs, shipment, emailLogs] = await Promise.all([
      Payment.find({ order: order._id }).sort({ createdAt: -1 }).lean(),
      Refund.find({ order: order._id }).sort({ createdAt: -1 }).populate('initiatedBy', 'name').lean(),
      ReturnRequest.find({ order: order._id }).sort({ createdAt: -1 }).lean(),
      order.shipment ? Shipment.findById(order.shipment).lean() : null,
      EmailLog.find({ order: order._id }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    const t = orders.TRANSITIONS[order.status];
    return ok(res, {
      ...order,
      payments: paymentDocs,
      refunds: refundDocs,
      returns: returnDocs,
      shipmentDoc: shipment,
      emailLog: emailLogs,
      allowedTransitions: t?.admin || [],
      refundable: (order.payment?.amountPaid || 0) - (order.payment?.amountRefunded || 0),
      shippingProvider: shippingProvider.enabled() ? 'shiprocket' : 'manual',
    });
  })
);

router.post(
  '/orders/:id/status',
  requirePermission('orders:write'),
  validate({ params: idParams, body: z.object({ status: z.enum(Object.values(ORDER_STATUS)), note: safeText(500).optional() }) }),
  h(async (req, res) => {
    const order = await loadOrder(req.params.id);
    if (req.body.status === ORDER_STATUS.CANCELLED) throw ApiError.badRequest('Use the cancel action so stock and refunds are handled');
    if (req.body.status === ORDER_STATUS.SHIPPED) throw ApiError.badRequest('Use the ship action to record carrier and tracking details');
    const updated = await orders.transition(order, req.body.status, { actor: req.admin, note: req.body.note, set: req.body.status === 'delivered' ? { deliveredAt: new Date() } : {} });
    if (['out_for_delivery', 'delivered', 'processing'].includes(req.body.status) && updated.shipment) {
      await Shipment.updateOne({ _id: updated.shipment }, { $set: { status: req.body.status === 'processing' ? 'pending' : req.body.status, ...(req.body.status === 'delivered' ? { deliveredAt: new Date() } : {}) }, $push: { events: { status: req.body.status, note: req.body.note } } });
    }
    if (['out_for_delivery', 'delivered'].includes(req.body.status)) {
      await email.send(req.body.status === 'delivered' ? 'order_delivered' : 'shipment_update', updated.email, { order: updated.toObject(), status: updated.status, orderUrl: orders.orderUrl(updated) });
    }
    await audit(req, { action: 'order.status', entity: 'Order', entityId: order._id, summary: `${order.orderNumber}: ${order.status} → ${req.body.status}` });
    return ok(res, { status: updated.status });
  })
);

// the courier brought the parcel back undelivered (refused COD, unreachable, bad address…)
router.post(
  '/orders/:id/rto',
  requirePermission('orders:write', 'refunds:write'),
  validate({ params: idParams, body: z.object({ reason: z.string().trim().min(3).max(300), restock: z.boolean().default(true), refundAmount: paise.default(0) }) }),
  h(async (req, res) => {
    const order = await loadOrder(req.params.id);
    const result = await refunds.markReturnedToOrigin(order, req.body, req.admin);
    await audit(req, { action: 'order.rto', entity: 'Order', entityId: order._id, summary: `${order.orderNumber}: returned to origin (${req.body.reason})${req.body.restock ? ', restocked' : ''}${result.refund ? ` · refund ${result.refund.amount}` : ''}` });
    return ok(res, { status: result.order.status, refund: result.refund });
  })
);

router.post(
  '/orders/:id/cancel',
  requirePermission('orders:write', 'refunds:write'),
  validate({ params: idParams, body: z.object({ reason: z.string().trim().min(3).max(300) }) }),
  h(async (req, res) => {
    const order = await loadOrder(req.params.id);
    const result = await refunds.cancelOrder(order, { reason: req.body.reason, actor: req.admin, actorType: 'admin' });
    await audit(req, { action: 'order.cancel', entity: 'Order', entityId: order._id, summary: `${order.orderNumber}: ${req.body.reason}${result.refund ? ` · refund ${result.refund.amount}` : ''}` });
    return ok(res, { status: result.order.status, refund: result.refund });
  })
);

router.post(
  '/orders/:id/ship',
  requirePermission('orders:write'),
  validate({ params: idParams, body: z.object({ carrier: z.string().trim().min(2).max(80), trackingNumber: z.string().trim().min(3).max(80), trackingUrl: z.string().url().max(500).optional().or(z.literal('')), method: z.string().max(40).optional(), note: safeText(300).optional() }) }),
  h(async (req, res) => {
    const order = await loadOrder(req.params.id);
    const result = await orders.createShipment(order, { ...req.body, trackingUrl: req.body.trackingUrl || undefined }, req.admin);
    await audit(req, { action: 'order.ship', entity: 'Order', entityId: order._id, summary: `${order.orderNumber}: ${req.body.carrier} ${req.body.trackingNumber}` });
    return ok(res, { status: result.order.status, shipment: result.shipment });
  })
);

router.post(
  '/orders/:id/ship/provider',
  requirePermission('orders:write'),
  validate({ params: idParams, body: z.object({ pickupLocation: z.string().max(80).optional(), weightKg: z.number().min(0.1).max(100).optional(), lengthCm: z.number().optional(), breadthCm: z.number().optional(), heightCm: z.number().optional() }) }),
  h(async (req, res) => {
    const order = await loadOrder(req.params.id);
    const created = await shippingProvider.createShipment(order, req.body);
    await Order.updateOne({ _id: order._id }, { $set: { 'shiprocket.status': created.awb ? 'awb_assigned' : 'pushed', 'shiprocket.orderId': created.orderId, 'shiprocket.shipmentId': created.shipmentId, 'shiprocket.awb': created.awb, 'shiprocket.courierName': created.courierName, 'shiprocket.lastError': '' } });
    const result = await orders.createShipment(order, { carrier: created.courierName || 'Shiprocket', trackingNumber: created.awb || created.providerRef, trackingUrl: created.awb ? `https://shiprocket.co/tracking/${created.awb}` : undefined, method: 'shiprocket' }, req.admin);
    await Shipment.updateOne({ _id: result.shipment._id }, { $set: { provider: 'shiprocket', providerRef: created.providerRef } });
    await audit(req, { action: 'order.ship_provider', entity: 'Order', entityId: order._id, summary: `Shiprocket ${created.providerRef}` });
    return ok(res, { status: result.order.status, shipment: result.shipment });
  })
);

// send (or re-send) a paid order to Shiprocket now
router.post(
  '/orders/:id/shiprocket/push',
  requirePermission('orders:write'),
  validate({ params: idParams }),
  h(async (req, res) => {
    const order = await loadOrder(req.params.id);
    if (!shippingProvider.enabled()) throw ApiError.unavailable('Shiprocket is not configured. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in backend/.env.', { code: 'PROVIDER_NOT_CONFIGURED' });
    if (!['confirmed', 'processing'].includes(order.status)) throw ApiError.conflict(`Only paid orders that are not yet shipped can be sent (this order is ${order.status})`);
    const updated = await require('../../services/shiprocket-sync.service').push(order._id);
    await audit(req, { action: 'order.shiprocket_push', entity: 'Order', entityId: order._id, summary: `${order.orderNumber}: ${updated?.shiprocket?.status} ${updated?.shiprocket?.orderId || ''}` });
    return ok(res, updated?.shiprocket || null);
  })
);

router.patch(
  '/orders/:id/shipment',
  requirePermission('orders:write'),
  validate({ params: idParams, body: z.object({ status: z.enum(['shipped', 'in_transit', 'out_for_delivery', 'delivered', 'rto']).optional(), location: safeText(120).optional(), note: safeText(300).optional(), trackingNumber: z.string().max(80).optional(), trackingUrl: z.string().url().optional(), carrier: z.string().max(80).optional() }) }),
  h(async (req, res) => {
    const order = await loadOrder(req.params.id);
    const result = await orders.updateShipment(order, req.body, req.admin);
    await audit(req, { action: 'order.shipment_update', entity: 'Order', entityId: order._id, summary: `${order.orderNumber}: ${JSON.stringify(req.body)}` });
    return ok(res, { status: result.order.status, shipment: result.shipment });
  })
);

router.post(
  '/orders/:id/notes',
  requirePermission('orders:read'),
  validate({ params: idParams, body: z.object({ note: z.string().trim().min(2).max(2000) }) }),
  h(async (req, res) => {
    await Order.updateOne({ _id: req.params.id }, { $push: { internalNotes: { note: req.body.note, by: req.admin._id, byName: req.admin.name } } });
    await audit(req, { action: 'order.note', entity: 'Order', entityId: req.params.id });
    return ok(res, { added: true });
  })
);

router.post(
  '/orders/:id/refunds',
  requirePermission('refunds:write'),
  validate({ params: idParams, body: z.object({ amount: paise, reason: z.string().trim().min(3).max(300), items: z.array(z.object({ orderItem: objectId, quantity: z.number().int().min(1) })).optional(), restock: z.boolean().default(false), idempotencyKey: z.string().min(8).max(64), manualReference: z.string().trim().max(80).optional() }) }),
  h(async (req, res) => {
    const result = await refunds.createRefund(req.params.id, req.body, req.admin);
    await audit(req, { action: 'refund.create', entity: 'Order', entityId: req.params.id, summary: `₹${(req.body.amount / 100).toFixed(2)} — ${req.body.reason}` });
    return ok(res, result.refund, undefined, 201);
  })
);

router.post('/orders/:id/reconcile', requirePermission('orders:write'), validate({ params: idParams }), h(async (req, res) => {
  const order = await loadOrder(req.params.id);
  const result = await payments.reconcileOrder(order);
  await audit(req, { action: 'order.reconcile', entity: 'Order', entityId: order._id, summary: result });
  return ok(res, { result });
}));

router.post(
  '/orders/:id/resend',
  requirePermission('orders:write'),
  validate({ params: idParams, body: z.object({ template: z.enum(['order_confirmation', 'shipment_dispatched', 'order_delivered']) }) }),
  h(async (req, res) => {
    const order = await loadOrder(req.params.id);
    const shipment = order.shipment ? await Shipment.findById(order.shipment).lean() : null;
    await email.send(req.body.template, order.email, { order: order.toObject(), shipment: shipment || {}, orderUrl: orders.orderUrl(order) });
    await Order.updateOne({ _id: order._id }, { $push: { notifications: { type: req.body.template, to: order.email, status: 'queued' } } });
    return ok(res, { queued: true });
  })
);

router.get('/orders/:id/invoice', requirePermission('orders:read'), validate({ params: idParams }), h(async (req, res) => {
  let order = await loadOrder(req.params.id);
  if (!order.invoice?.number && order.payment.status !== 'created') order = await orders.assignInvoiceNumber(order);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
  return res.send(await invoice.renderInvoice(order.toObject(), { taxConfig: await tax.get() }));
}));

// ---------------- payments / refunds ----------------

router.get('/payments', requirePermission('orders:read'), h(async (req, res) => {
  const pg = parsePagination(req.query, { defaultLimit: 50 });
  const filter = req.query.status ? { status: String(req.query.status) } : {};
  const [items, total] = await Promise.all([Payment.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate('order', 'orderNumber email').lean(), Payment.countDocuments(filter)]);
  return ok(res, items, pageMeta(pg, total));
}));

router.get('/refunds', requirePermission('orders:read'), h(async (req, res) => {
  const pg = parsePagination(req.query, { defaultLimit: 50 });
  const filter = req.query.status ? { status: String(req.query.status) } : {};
  if (req.query.mode) filter.mode = String(req.query.mode);
  const [items, total] = await Promise.all([Refund.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate('order', 'orderNumber email').populate('initiatedBy', 'name').lean(), Refund.countDocuments(filter)]);
  return ok(res, items, pageMeta(pg, total));
}));

// COD refunds: the money was sent by bank transfer / UPI — record it and tell the customer
router.post(
  '/refunds/:id/mark-paid',
  requirePermission('refunds:write'),
  validate({ params: idParams, body: z.object({ reference: z.string().trim().min(4).max(80) }) }),
  h(async (req, res) => {
    const { refund, order } = await refunds.markManualRefundPaid(req.params.id, { reference: req.body.reference }, req.admin);
    await audit(req, { action: 'refund.mark_paid', entity: 'Refund', entityId: refund._id, summary: `${order.orderNumber}: ₹${(refund.amount / 100).toFixed(2)} paid, ref ${refund.manualReference}` });
    return ok(res, { refund, paymentStatus: order.payment.status, orderStatus: order.status });
  })
);

// ---------------- returns ----------------

router.get('/returns', requirePermission('orders:read'), h(async (req, res) => {
  const pg = parsePagination(req.query, { defaultLimit: 50 });
  const filter = req.query.status ? { status: String(req.query.status) } : {};
  const [items, total] = await Promise.all([ReturnRequest.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate('order', 'orderNumber email customerName').lean(), ReturnRequest.countDocuments(filter)]);
  return ok(res, items, pageMeta(pg, total));
}));

router.patch(
  '/returns/:id',
  requirePermission('orders:write'),
  validate({ params: idParams, body: z.object({ status: z.enum(['approved', 'rejected', 'pickup_scheduled', 'received', 'refund_initiated', 'refunded', 'closed']).optional(), adminNotes: safeText(1000).optional(), returnShippingPaidBy: z.enum(['customer', 'store']).optional(), deductionAmount: paise.optional(), restock: z.boolean().optional() }) }),
  h(async (req, res) => {
    const r = await refunds.updateReturnRequest(req.params.id, req.body, req.admin);
    await audit(req, { action: 'return.update', entity: 'ReturnRequest', entityId: r._id, summary: `${r.requestNumber} → ${r.status}` });
    return ok(res, r);
  })
);

// ---------------- customers ----------------

router.get('/customers', requirePermission('customers:read'), h(async (req, res) => {
  const pg = parsePagination(req.query, { defaultLimit: 50 });
  const filter = { role: 'customer' };
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.q) {
    const rx = { $regex: escapeRegex(String(req.query.q).slice(0, 80)), $options: 'i' };
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  const [items, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(), User.countDocuments(filter)]);
  const ids = items.map((u) => u._id);
  const orderList = await Order.find({ user: { $in: ids }, 'payment.status': { $in: ['captured', 'partially_refunded', 'refunded'] } }).select('user pricing.grandTotal').lean();
  const stats = new Map();
  for (const o of orderList) {
    const s = stats.get(String(o.user)) || { orders: 0, spent: 0 };
    s.orders += 1;
    s.spent += o.pricing.grandTotal;
    stats.set(String(o.user), s);
  }
  return ok(res, items.map((u) => ({ id: String(u._id), name: u.name, email: u.email, phone: u.phone, status: u.status, emailVerified: u.emailVerified, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, ...(stats.get(String(u._id)) || { orders: 0, spent: 0 }) })), pageMeta(pg, total));
}));

router.get('/customers/:id', requirePermission('customers:read'), validate({ params: idParams }), h(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'customer' }).lean();
  if (!user) throw ApiError.notFound('Customer not found');
  const [addresses, orderList, reviewList, sessions] = await Promise.all([
    Address.find({ user: user._id }).lean(),
    Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(100).select('orderNumber status pricing.grandTotal payment.status createdAt').lean(),
    Review.find({ user: user._id }).populate('product', 'name').lean(),
    Session.countDocuments({ user: user._id, revokedAt: null, expiresAt: { $gt: new Date() } }),
  ]);
  return ok(res, {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    suspendedReason: user.suspendedReason,
    emailVerified: user.emailVerified,
    emailVerifiedAt: user.emailVerifiedAt,
    notificationPrefs: user.notificationPrefs,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    supportNotes: user.supportNotes,
    privacyRequests: user.privacyRequests,
    activeSessions: sessions,
    addresses,
    orders: orderList,
    reviews: reviewList.map((r) => ({ id: String(r._id), product: r.product?.name, rating: r.rating, status: r.status })),
  });
}));

router.post(
  '/customers/:id/status',
  requirePermission('customers:write'),
  validate({ params: idParams, body: z.object({ status: z.enum(['active', 'suspended']), reason: safeText(300).optional() }) }),
  h(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, role: 'customer' });
    if (!user) throw ApiError.notFound('Customer not found');
    if (req.body.status === 'active' && !user.emailVerified) throw ApiError.badRequest('The customer has not verified their email yet');
    user.status = req.body.status;
    user.suspendedReason = req.body.status === 'suspended' ? req.body.reason : undefined;
    if (req.body.status === 'suspended') {
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      await Session.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'suspended' } });
    }
    await user.save();
    await audit(req, { action: `customer.${req.body.status}`, entity: 'User', entityId: user._id, summary: req.body.reason });
    return ok(res, { status: user.status });
  })
);

router.post('/customers/:id/notes', requirePermission('customers:read'), validate({ params: idParams, body: z.object({ note: z.string().trim().min(2).max(2000) }) }), h(async (req, res) => {
  await User.updateOne({ _id: req.params.id, role: 'customer' }, { $push: { supportNotes: { note: req.body.note, by: req.admin._id, byName: req.admin.name } } });
  await audit(req, { action: 'customer.note', entity: 'User', entityId: req.params.id });
  return ok(res, { added: true });
}));

router.patch(
  '/customers/:id/privacy-requests/:requestId',
  requirePermission('customers:export'),
  validate({ params: z.object({ id: objectId, requestId: objectId }), body: z.object({ status: z.enum(['completed', 'rejected']), note: safeText(500).optional() }) }),
  h(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, role: 'customer' });
    const pr = user?.privacyRequests.id(req.params.requestId);
    if (!pr) throw ApiError.notFound();
    pr.status = req.body.status;
    pr.note = req.body.note || pr.note;
    pr.completedAt = new Date();
    if (pr.type === 'erasure' && req.body.status === 'completed') {
      // anonymise the account; order records are retained as required for tax/accounting
      user.name = 'Deleted customer';
      user.email = `deleted-${user._id}@invalid.local`;
      user.phone = undefined;
      user.status = 'deleted';
      user.deletedAt = new Date();
      user.passwordHash = undefined;
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      await Address.deleteMany({ user: user._id });
      await Wishlist.deleteMany({ user: user._id });
      await Session.updateMany({ user: user._id }, { $set: { revokedAt: new Date(), revokedReason: 'erasure' } });
    }
    await user.save();
    await audit(req, { action: 'customer.privacy_request', entity: 'User', entityId: user._id, summary: `${pr.type} → ${pr.status}` });
    return ok(res, pr);
  })
);

router.get('/customers/:id/export', requirePermission('customers:export'), validate({ params: idParams }), h(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'customer' }).lean();
  if (!user) throw ApiError.notFound();
  const [addresses, orderList, reviewList] = await Promise.all([Address.find({ user: user._id }).lean(), Order.find({ user: user._id }).select('-guestAccessHash -internalNotes').lean(), Review.find({ user: user._id }).lean()]);
  delete user.passwordHash;
  delete user.mfa;
  await audit(req, { action: 'customer.export', entity: 'User', entityId: user._id });
  res.set('Content-Disposition', `attachment; filename="customer-${user._id}.json"`);
  return res.json({ exportedAt: new Date(), account: user, addresses, orders: orderList, reviews: reviewList });
}));

// ---------------- coupons ----------------

const couponBody = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'Use 3–30 letters, numbers, - or _'),
    description: safeText(200).optional(),
    type: z.enum(['percent', 'fixed']),
    value: z.number().int().min(1),
    maxDiscount: paise.nullable().optional(),
    minCartValue: paise.optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    usageLimit: z.number().int().min(1).nullable().optional(),
    perCustomerLimit: z.number().int().min(0).optional(),
    eligibleProducts: z.array(objectId).optional(),
    eligibleCategories: z.array(objectId).optional(),
    excludeSaleItems: z.boolean().optional(),
    newCustomersOnly: z.boolean().optional(),
    stackable: z.boolean().optional(),
    isActive: z.boolean().optional(),
  });

router.use(
  '/coupons',
  crud({
    Model: Coupon,
    schema: couponBody,
    entity: 'Coupon',
    read: 'orders:read',
    write: 'coupons:write',
    searchFields: ['code', 'description'],
    filters: { active: 'isActive' },
    beforeSave: async (data, req, doc) => {
      const type = data.type || doc?.type;
      if (type === 'percent' && data.value !== undefined && data.value > 90) throw ApiError.badRequest('Percentage discounts cannot exceed 90%');
      if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) throw ApiError.badRequest('End date must be after start date');
      return { ...data, ...(doc ? {} : { createdBy: req.admin._id }) };
    },
    canDelete: async (doc) => ((await CouponRedemption.exists({ coupon: doc._id })) ? 'This coupon has been used — disable it instead of deleting' : null),
  })
);

// ---------------- reviews ----------------

router.get('/reviews', requirePermission('reviews:moderate'), h(async (req, res) => {
  const pg = parsePagination(req.query, { defaultLimit: 50 });
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.reported === 'true') filter.reportCount = { $gt: 0 };
  const [items, total] = await Promise.all([Review.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate('product', 'name slug').populate('user', 'name email').lean(), Review.countDocuments(filter)]);
  return ok(res, items, pageMeta(pg, total));
}));

router.patch(
  '/reviews/:id',
  requirePermission('reviews:moderate'),
  validate({ params: idParams, body: z.object({ status: z.enum(['approved', 'rejected', 'pending']), rejectionReason: safeText(300).optional() }) }),
  h(async (req, res) => {
    const r = await reviews.moderate(req.params.id, req.body, req.admin);
    await audit(req, { action: `review.${req.body.status}`, entity: 'Review', entityId: r._id });
    return ok(res, r);
  })
);

module.exports = router;
