'use strict';

const { ok, ApiError } = require('../utils/http');
const { sha256, safeEqual } = require('../utils/crypto');
const { Order, Address } = require('../models');
const cartService = require('../services/cart.service');
const checkout = require('../services/checkout.service');
const payments = require('../services/payment.service');
const settings = require('../services/settings.service');
const { ctx, guestToken, noStore } = require('./helpers');

async function loadOrderForPayer(req, orderNumber) {
  const order = await Order.findOne({ orderNumber });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.user) {
    if (!req.user || String(order.user) !== String(req.user._id)) throw ApiError.notFound('Order not found');
  } else {
    const token = req.headers['x-ddg-order-token'] || (req.method === 'GET' && typeof req.query.t === 'string' ? req.query.t : null);
    if (!token || !order.guestAccessHash || !safeEqual(sha256(token), order.guestAccessHash)) throw ApiError.notFound('Order not found');
  }
  return order;
}

module.exports = {
  config: async (_req, res) => {
    const [checkoutCfg, shippingCfg] = await Promise.all([settings.get('checkout'), settings.get('shipping')]);
    return ok(res, {
      guestCheckout: checkoutCfg.guestCheckout,
      paymentsEnabled: require('../config/env').razorpayConfigured,
      onlinePaymentsEnabled: require('../config/env').razorpayConfigured,
      codEnabled: Boolean(checkoutCfg.codEnabled),
      codGuestAllowed: checkoutCfg.codGuestAllowed !== false,
      codFee: checkoutCfg.codFee || 0,
      packagingMode: checkoutCfg.packagingMode,
      ageConfirmationText: checkoutCfg.ageConfirmationText,
      freeShippingThreshold: shippingCfg.freeShippingEnabled ? shippingCfg.freeShippingThreshold : null,
      international: shippingCfg.internationalMode,
      states: require('../services/shipping.service').INDIAN_STATES,
    });
  },

  quote: async (req, res) => {
    noStore(res);
    const cart = await cartService.findCart({ user: req.user, guestToken: guestToken(req) });
    let destination = null;
    if (req.body.addressId && req.user) {
      const a = await Address.findOne({ _id: req.body.addressId, user: req.user._id }).lean();
      if (!a) throw ApiError.notFound('Address not found');
      destination = { pincode: a.pincode, state: a.state, country: a.country || 'IN' };
    } else if (req.body.pincode) {
      destination = { pincode: req.body.pincode, state: req.body.state, country: req.body.country || 'IN' };
    }
    const view = await cartService.buildView(cart, { user: req.user, email: req.body.email, destination, rateId: req.body.rateId, paymentMethod: req.body.paymentMethod });
    return ok(res, view);
  },

  place: async (req, res) => {
    noStore(res);
    const result = await checkout.placeOrder({ user: req.user, guestToken: guestToken(req), input: req.body, ctx: ctx(req) });
    return ok(res, result, undefined, 201);
  },

  resume: async (req, res) => {
    noStore(res);
    const order = await loadOrderForPayer(req, req.params.orderNumber);
    return ok(res, await checkout.resumePayment(order));
  },

  verify: async (req, res) => {
    noStore(res);
    const order = await payments.verifyCheckoutPayment(req.body, { user: req.user });
    return ok(res, { orderNumber: order.orderNumber, status: order.status, paid: order.payment.status === 'captured' });
  },

  failure: async (req, res) => {
    await payments.recordClientFailure(req.body);
    return ok(res, { recorded: true });
  },

  webhook: async (req, res) => {
    const result = await payments.handleWebhook(req.body, req.headers['x-razorpay-signature'], req.headers['x-razorpay-event-id']);
    return res.status(200).json({ success: true, ...result });
  },

  loadOrderForPayer,
};
