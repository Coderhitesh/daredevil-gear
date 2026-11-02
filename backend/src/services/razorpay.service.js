'use strict';

/**
 * Thin wrapper around the official Razorpay Node SDK.
 * Signature verification follows Razorpay's documented scheme:
 *   payment:  HMAC_SHA256(key_secret, `${razorpay_order_id}|${razorpay_payment_id}`)
 *   webhook:  HMAC_SHA256(webhook_secret, rawRequestBody)
 */
const Razorpay = require('razorpay');
const env = require('../config/env');
const logger = require('../config/logger');
const { ApiError } = require('../utils/http');
const { hmacSha256, safeEqual } = require('../utils/crypto');

let client = null;

function getClient() {
  if (client) return client;
  if (!env.razorpayConfigured) throw ApiError.unavailable('Online payment is not configured yet. Please try again later.', { code: 'PAYMENTS_NOT_CONFIGURED' });
  client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return client;
}

/** Throws 503 PAYMENTS_NOT_CONFIGURED unless keys are set (or a test client is injected). */
function assertConfigured() {
  if (!client) getClient();
}

/** Test hook: inject a fake client. */
function setClient(fake) {
  client = fake;
}

function keySecret() {
  return process.env.RAZORPAY_KEY_SECRET_OVERRIDE || env.RAZORPAY_KEY_SECRET;
}
function webhookSecret() {
  return process.env.RAZORPAY_WEBHOOK_SECRET_OVERRIDE || env.RAZORPAY_WEBHOOK_SECRET;
}

/** Plain-language reason for a Razorpay API failure (shown in logs, and to developers outside production). */
function explain(err) {
  const status = err?.statusCode;
  const desc = err?.error?.description || err?.message || '';
  if (status === 401 || /authentication failed/i.test(desc)) return 'Razorpay rejected the API keys. RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be a matching pair from the same mode (rzp_test_… with its test secret, or rzp_live_… with its live secret). Regenerate them in Razorpay Dashboard → Account & Settings → API Keys if unsure.';
  if (!status || /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket/i.test(`${err?.code} ${desc}`)) return `Could not reach api.razorpay.com (${err?.code || desc || 'network error'}). Check the server's internet access / firewall.`;
  return `Razorpay error ${status}: ${desc || 'no description'}`;
}

async function createOrder({ amount, receipt, notes }) {
  try {
    return await getClient().orders.create({ amount, currency: 'INR', receipt, notes, payment_capture: 1 });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const hint = explain(err);
    logger.error({ statusCode: err?.statusCode, razorpay: err?.error, receipt }, `Razorpay order creation failed: ${hint}`);
    throw ApiError.unavailable(`We could not start the payment right now. Please try again in a few minutes.${env.isProd ? '' : ` [dev: ${hint}]`}`, { code: 'PAYMENT_GATEWAY_ERROR' });
  }
}

function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const secret = keySecret();
  if (!secret || !orderId || !paymentId || !signature) return false;
  return safeEqual(hmacSha256(secret, `${orderId}|${paymentId}`), signature);
}

function verifyWebhookSignature(rawBody, signature) {
  const secret = webhookSecret();
  if (!secret || !rawBody || !signature) return false;
  return safeEqual(hmacSha256(secret, rawBody), signature);
}

async function fetchPayment(paymentId) {
  return getClient().payments.fetch(paymentId);
}

async function fetchOrderPayments(orderId) {
  const res = await getClient().orders.fetchPayments(orderId);
  return res?.items || [];
}

async function refund(paymentId, { amount, notes, receipt }) {
  return getClient().payments.refund(paymentId, { amount, speed: 'normal', notes, receipt });
}

async function fetchRefund(paymentId, refundId) {
  return getClient().payments.fetchRefund(paymentId, refundId);
}

function publicKey() {
  return env.RAZORPAY_KEY_ID || null;
}

module.exports = { getClient, assertConfigured, explain, setClient, createOrder, verifyPaymentSignature, verifyWebhookSignature, fetchPayment, fetchOrderPayments, refund, fetchRefund, publicKey };
