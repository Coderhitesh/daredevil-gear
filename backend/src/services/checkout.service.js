'use strict';

/**
 * Checkout: re-validates everything server-side, creates the order snapshot, holds stock and the coupon,
 * and creates the Razorpay order. Prices, discounts, tax and totals from the browser are never used.
 */

const { Order, Payment, Address } = require('../models');
const { ApiError } = require('../utils/http');
const { sha256, randomToken } = require('../utils/crypto');
const env = require('../config/env');
const logger = require('../config/logger');
const cartService = require('./cart.service');
const couponService = require('./coupon.service');
const shipping = require('./shipping.service');
const codService = require('./cod.service');
const offerService = require('./offer.service');
const pricing = require('./pricing.service');
const settings = require('./settings.service');
const tax = require('./tax.service');
const inventory = require('./inventory.service');
const razorpay = require('./razorpay.service');
const orders = require('./order.service');

function snapshotAddress(a) {
  return {
    fullName: a.fullName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    landmark: a.landmark,
    city: a.city,
    state: a.state,
    pincode: String(a.pincode).trim(),
    country: (a.country || 'IN').toUpperCase(),
    gstin: a.gstin,
    companyName: a.companyName,
  };
}

async function resolveAddress(input, user) {
  if (input.addressId) {
    if (!user) throw ApiError.badRequest('Sign in to use a saved address');
    const a = await Address.findOne({ _id: input.addressId, user: user._id }).lean();
    if (!a) throw ApiError.notFound('Address not found');
    return snapshotAddress(a);
  }
  if (!input.address) throw ApiError.unprocessable('Shipping address is required');
  return snapshotAddress(input.address);
}

/** Response for a cash-on-delivery order (no payment step). */
function codPayload(order) {
  return { orderId: String(order._id), orderNumber: order.orderNumber, status: order.status, paymentMethod: 'cod', amountDue: order.pricing.grandTotal };
}

/** Paying for an existing pending order (retry) returns the same Razorpay order. */
function paymentPayload(order, payment) {
  return {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    expiresAt: order.expiresAt,
    razorpay: {
      keyId: razorpay.publicKey(),
      orderId: payment.razorpayOrderId,
      amount: payment.amount,
      currency: 'INR',
      name: 'DareDevil Gears',
      description: `Order ${order.orderNumber}`,
      prefill: { name: order.customerName, email: order.email, contact: order.phone },
      notes: { orderNumber: order.orderNumber },
    },
  };
}

async function placeOrder({ user, guestToken, input, ctx }) {
  const isCod = input.paymentMethod === 'cod';
  // fail before creating an order or reserving stock when no payment gateway is set up
  if (!isCod) razorpay.assertConfigured();
  const checkoutCfg = await settings.get('checkout');
  if (!user && !checkoutCfg.guestCheckout) throw ApiError.unauthorized('Please sign in to check out');
  if (user && !user.emailVerified) throw ApiError.forbidden('Please verify your email before checking out', { code: 'EMAIL_NOT_VERIFIED' });

  // ---- idempotency: a repeated submit returns the same order
  const idemKey = input.idempotencyKey ? `${user ? user._id : 'guest'}:${input.idempotencyKey}` : null;
  if (idemKey) {
    const existing = await Order.findOne({ idempotencyKey: idemKey });
    if (existing) {
      const payment = await Payment.findOne({ order: existing._id }).sort({ createdAt: -1 });
      if (existing.status === 'pending_payment' && payment) return { ...paymentPayload(existing, payment), replay: true };
      if (existing.payment?.provider === 'cod' && existing.status !== 'expired') return { ...codPayload(existing), replay: true };
      throw ApiError.conflict('This checkout was already submitted', { code: 'DUPLICATE_SUBMIT', details: [{ field: 'orderNumber', message: existing.orderNumber }] });
    }
  }

  const cart = await cartService.findCart({ user, guestToken });
  if (!cart || !cart.items.length) throw ApiError.badRequest('Your cart is empty', { code: 'CART_EMPTY' });

  const { lines, problems } = await cartService.loadLines(cart.items);
  if (problems.length) {
    await cart.save();
    throw ApiError.conflict('Your cart changed. Please review it before paying.', { code: 'CART_CHANGED', details: problems.map((p) => ({ field: p.itemId || 'cart', message: p.message })) });
  }
  const purchasable = lines.filter((l) => !l.blocked);
  if (!purchasable.length || purchasable.length !== lines.length) throw ApiError.conflict('Some items are unavailable. Please review your cart.', { code: 'CART_CHANGED' });

  const contactEmail = (user ? user.email : input.contact?.email || '').toLowerCase().trim();
  if (!contactEmail) throw ApiError.unprocessable('Email is required');
  const shippingAddress = await resolveAddress({ addressId: input.addressId, address: input.shippingAddress }, user);
  const billingAddress = input.billingSameAsShipping === false && input.billingAddress ? snapshotAddress(input.billingAddress) : shippingAddress;

  // ---- legal restrictions & age confirmation (cannot be overridden by shipping rules)
  const restr = shipping.restrictions(purchasable, { country: shippingAddress.country, state: shippingAddress.state });
  if (restr.blocked.length) throw ApiError.unprocessable(`${restr.blocked[0].name}: ${restr.blocked[0].reason}`, { code: 'DESTINATION_RESTRICTED' });
  if (restr.requiresAgeConfirmation && input.ageConfirmed !== true) {
    throw ApiError.unprocessable('Please confirm you are 18 or older to buy age-restricted items', { code: 'AGE_CONFIRMATION_REQUIRED' });
  }

  // ---- coupon & delivery, recomputed server-side
  const taxConfig = await tax.get();
  let coupon = null;
  const offerResult = await offerService.apply(purchasable);
  if (cart.couponCode) coupon = await couponService.evaluate(cart.couponCode, { lines: offerService.linesForCoupon(purchasable, offerResult), excludeLineIdx: offerResult.lockedIdx, user, email: contactEmail });
  const pre = pricing.quote({ lines: purchasable, coupon, offers: offerResult, packagingMode: checkoutCfg.packagingMode, taxConfig });
  if (isCod) {
    const base = codService.baseEligibility(checkoutCfg, { user, country: (shippingAddress.country || 'IN').toUpperCase(), orderValue: pre.totals.grandTotal });
    if (!base.ok) throw ApiError.unprocessable(base.reason, { code: 'COD_NOT_AVAILABLE' });
    await codService.assertOpenOrdersBelowLimit(checkoutCfg, { email: contactEmail, phone: input.contact?.phone || shippingAddress.phone });
  }
  const ship = await shipping.options({ lines: purchasable, destination: shippingAddress, netItemsTotal: pre.totals.netItems, paymentMethod: isCod ? 'cod' : 'online' });
  const rate = input.rateId ? ship.options.find((o) => o.rateId === input.rateId) : ship.options[0];
  if (!rate) throw ApiError.unprocessable('Please choose a delivery option', { code: 'NO_DELIVERY_OPTION' });
  const codFee = isCod ? codService.fee(checkoutCfg, rate) : 0;

  const q = pricing.quote({ lines: purchasable, coupon, offers: offerResult, shipping: { charge: rate.charge }, cod: isCod ? { charge: codFee } : null, packagingMode: checkoutCfg.packagingMode, taxConfig, shipState: shippingAddress.state });
  if (isCod) {
    const base = codService.baseEligibility(checkoutCfg, { user, country: 'IN', orderValue: q.totals.grandTotal - codFee });
    if (!base.ok) throw ApiError.unprocessable(base.reason, { code: 'COD_NOT_AVAILABLE' });
  }

  // the client shows a total; if it no longer matches, make the shopper look again
  if (input.expectedTotal != null && Number(input.expectedTotal) !== q.totals.grandTotal) {
    throw ApiError.conflict('The total has changed. Please review your order before paying.', { code: 'TOTAL_CHANGED', details: [{ field: 'grandTotal', message: String(q.totals.grandTotal) }] });
  }
  if (q.totals.grandTotal < 100) throw ApiError.unprocessable('Order total is too low for online payment');

  // ---- create the order snapshot
  const guestAccessToken = user ? null : randomToken(24);
  const order = await Order.create({
    orderNumber: await orders.generateOrderNumber(),
    user: user?._id,
    isGuest: !user,
    guestAccessHash: guestAccessToken ? sha256(guestAccessToken) : undefined,
    email: contactEmail,
    phone: input.contact?.phone || shippingAddress.phone,
    customerName: input.contact?.name || user?.name || shippingAddress.fullName,
    items: q.items.map((qi) => ({
      product: qi.product._id,
      variant: qi.variant._id,
      name: qi.product.name,
      variantTitle: qi.variant.title,
      sku: qi.variant.sku,
      slug: qi.product.slug,
      image: qi.product.images?.[0]?.url,
      hsnCode: qi.product.hsnCode,
      quantity: qi.quantity,
      unitPriceInclusive: qi.unitPriceInclusive,
      regularUnitPriceInclusive: qi.regularUnitPriceInclusive,
      lineTotalInclusive: qi.lineTotalInclusive,
      discount: qi.discount,
      packagingCharge: qi.packagingCharge,
      gstRate: qi.gstRate,
      taxableValue: qi.taxableValue,
      taxAmount: qi.taxAmount,
      netTotal: qi.netTotal,
      returnable: qi.product.compliance?.returnable !== false,
      returnWindowDays: qi.product.compliance?.returnWindowDays ?? 7,
    })),
    shippingAddress,
    billingAddress,
    delivery: {
      provider: rate.provider === 'shiprocket' ? 'shiprocket' : 'manual',
      zone: rate.provider === 'shiprocket' ? undefined : rate.zoneId,
      rate: rate.provider === 'shiprocket' ? undefined : rate.rateId,
      method: rate.method,
      label: rate.name,
      estimatedDays: rate.estimatedDays || undefined,
      courierId: rate.courierId || undefined,
      courierName: rate.courierName || undefined,
      etd: rate.etd || undefined,
      weightKg: ship.weightKg,
      lengthCm: ship.parcel?.lengthCm,
      breadthCm: ship.parcel?.breadthCm,
      heightCm: ship.parcel?.heightCm,
    },
    pricing: {
      itemsTotal: q.totals.itemsTotal,
      discount: q.totals.discount,
      couponCode: q.totals.couponCode || undefined,
      offerDiscount: q.totals.offerDiscount,
      offers: q.totals.offers,
      packagingCharge: q.totals.packagingCharge,
      packagingTax: q.totals.packagingTax,
      shippingCharge: q.totals.shippingCharge,
      shippingTax: q.totals.shippingTax,
      codCharge: q.totals.codCharge,
      codTax: q.totals.codTax,
      taxableTotal: q.totals.taxableTotal,
      taxTotal: q.totals.taxTotal,
      grandTotal: q.totals.grandTotal,
      taxBreakup: q.totals.taxBreakup,
      supplyType: q.totals.supplyType,
      cgst: q.totals.cgst,
      sgst: q.totals.sgst,
      igst: q.totals.igst,
    },
    status: 'pending_payment',
    statusHistory: [{ from: null, to: 'pending_payment', byRole: user ? 'customer' : 'guest', note: isCod ? 'Order created (cash on delivery)' : 'Order created' }],
    ...(isCod ? { payment: { provider: 'cod', method: 'cod', status: 'created' } } : {}),
    coupon: coupon?.coupon?._id,
    idempotencyKey: idemKey || undefined,
    ageConfirmedAt: restr.requiresAgeConfirmation ? new Date() : undefined,
    expiresAt: new Date(Date.now() + env.PAYMENT_EXPIRY_MIN * 60_000),
    ip: ctx?.ip,
    userAgent: ctx?.userAgent?.slice(0, 300),
  });

  async function saveAddressIfAsked() {
    if (input.saveAddress && user && !input.addressId) {
      const count = await Address.countDocuments({ user: user._id });
      if (count < 20) await Address.create({ ...shippingAddress, user: user._id, isDefaultShipping: count === 0, isDefaultBilling: count === 0 });
    }
  }

  // ---- hold stock and coupon; roll back on any failure
  const invLines = order.items.map((i) => ({ variant: i.variant, product: i.product, sku: i.sku, quantity: i.quantity, name: i.name }));
  try {
    await inventory.reserve(invLines, { order: order._id });
    order.inventory.reserved = true;
    if (coupon) await couponService.reserve(coupon.coupon, { order: order._id, user: user?._id, email: contactEmail, amount: q.totals.discount });

    if (isCod) {
      await order.save();
      await saveAddressIfAsked();
      const confirmed = await require('./payment.service').confirmCod(order);
      if (!user) {
        // guest carts are not linked to the order; remove what was bought
        const bought = new Set(order.items.map((i) => String(i.variant)));
        cart.items = cart.items.filter((i) => !bought.has(String(i.variant)));
        cart.couponCode = undefined;
        await cart.save();
      }
      return { ...codPayload(confirmed), guestAccessToken };
    }

    const rzpOrder = await razorpay.createOrder({ amount: q.totals.grandTotal, receipt: order.orderNumber, notes: { orderId: String(order._id), orderNumber: order.orderNumber } });
    order.payment.razorpayOrderId = rzpOrder.id;
    await order.save();
    const payment = await Payment.create({ order: order._id, razorpayOrderId: rzpOrder.id, amount: q.totals.grandTotal, status: 'created', events: [{ type: 'order.created' }] });

    await saveAddressIfAsked();
    return { ...paymentPayload(order, payment), guestAccessToken };
  } catch (err) {
    logger.warn({ err: err.message, order: order.orderNumber }, 'Checkout failed after order creation; rolling back');
    if (order.inventory.reserved) await inventory.release(invLines, { order: order._id, reason: 'Checkout rollback' }).catch(() => {});
    await couponService.release(order._id).catch(() => {});
    await Order.updateOne(
      { _id: order._id },
      { $set: { status: 'expired', 'inventory.released': true }, $unset: { idempotencyKey: 1 }, $push: { statusHistory: { from: 'pending_payment', to: 'expired', byRole: 'system', note: `Checkout failed: ${err.message}` } } }
    );
    throw err;
  }
}

/** Resume payment for a still-pending order (same Razorpay order). */
async function resumePayment(order) {
  if (!['pending_payment', 'payment_failed'].includes(order.status)) throw ApiError.conflict('This order is no longer awaiting payment', { code: 'NOT_PENDING' });
  if (order.expiresAt && order.expiresAt < new Date()) throw ApiError.conflict('This payment window has expired. Please place the order again.', { code: 'PAYMENT_EXPIRED' });
  const payment = await Payment.findOne({ order: order._id, razorpayOrderId: order.payment.razorpayOrderId });
  if (!payment) throw ApiError.notFound('Payment not found');
  return paymentPayload(order, payment);
}

module.exports = { placeOrder, resumePayment, snapshotAddress };
