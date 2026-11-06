'use strict';

/**
 * CCAvenue (hosted payment page + status/refund API).
 *   request/response encryption: AES-128-CBC, key = MD5(working key), IV = 00 01 … 0f, hex encoded.
 * Exposes the same shape the rest of the backend used for payments (createOrder, fetchOrderPayments, refund …),
 * so Order/Payment fields keep their names: razorpayOrderId = CCAvenue order_id, razorpayPaymentId = tracking_id.
 */
const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../config/logger');
const { ApiError } = require('../utils/http');

const HOSTS = {
  test: { pay: 'https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction', api: 'https://apitest.ccavenue.com/apis/servlet/DoWebTrans' },
  live: { pay: 'https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction', api: 'https://api.ccavenue.com/apis/servlet/DoWebTrans' },
};
const IV = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
const host = () => HOSTS[env.ccavenueMode];

function assertConfigured() {
  if (!env.ccavenueConfigured) throw ApiError.unavailable('Online payment is not configured yet. Please try again later.', { code: 'PAYMENTS_NOT_CONFIGURED' });
}

function encrypt(plain) {
  const key = crypto.createHash('md5').update(env.CCAVENUE_WORKING_KEY).digest();
  const c = crypto.createCipheriv('aes-128-cbc', key, IV);
  return Buffer.concat([c.update(String(plain), 'utf8'), c.final()]).toString('hex');
}

function decrypt(hex) {
  const key = crypto.createHash('md5').update(env.CCAVENUE_WORKING_KEY).digest();
  const d = crypto.createDecipheriv('aes-128-cbc', key, IV);
  return Buffer.concat([d.update(Buffer.from(String(hex).trim(), 'hex')), d.final()]).toString('utf8');
}

const rupees = (paise) => (paise / 100).toFixed(2);
const toPaise = (v) => Math.round(parseFloat(v) * 100);

/** No remote call: CCAvenue order_id is our order number. */
async function createOrder({ receipt }) {
  assertConfigured();
  return { id: receipt };
}

/** Fields the browser POSTs to CCAvenue's hosted page. */
function paymentForm(order, payment) {
  const b = order.billingAddress || order.shippingAddress || {};
  const redirect = env.CCAVENUE_REDIRECT_URL || `${env.STOREFRONT_URL}/api/v1/payments/ccavenue/response`;
  const params = new URLSearchParams({
    merchant_id: env.CCAVENUE_MERCHANT_ID,
    order_id: payment.razorpayOrderId,
    currency: 'INR',
    amount: rupees(payment.amount),
    redirect_url: redirect,
    cancel_url: redirect,
    language: 'EN',
    billing_name: order.customerName || b.fullName || '',
    billing_address: [b.line1, b.line2].filter(Boolean).join(', '),
    billing_city: b.city || '',
    billing_state: b.state || '',
    billing_zip: b.pincode || '',
    billing_country: !b.country || b.country === 'IN' ? 'India' : b.country,
    billing_tel: order.phone || b.phone || '',
    billing_email: order.email || '',
    merchant_param1: order.orderNumber,
  });
  return { url: host().pay, accessCode: env.CCAVENUE_ACCESS_CODE, encRequest: encrypt(params.toString()) };
}

/** Decrypt the browser POST (encResp) sent to our redirect/cancel URL. Throws if it was not encrypted with our key. */
function parseResponse(encResp) {
  try {
    return Object.fromEntries(new URLSearchParams(decrypt(encResp)));
  } catch {
    throw ApiError.badRequest('Invalid payment response', { code: 'BAD_SIGNATURE' });
  }
}

/** Status / refund API call. Returns the decrypted JSON object. */
async function callApi(command, payload) {
  assertConfigured();
  const body = new URLSearchParams({ enc_request: encrypt(JSON.stringify(payload)), access_code: env.CCAVENUE_ACCESS_CODE, command, request_type: 'JSON', response_type: 'JSON', version: '1.2' });
  const res = await fetch(host().api, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(20_000) });
  const out = new URLSearchParams((await res.text()).trim());
  if (out.get('status') !== '0' || !out.get('enc_response')) {
    logger.warn({ command, status: out.get('status'), code: out.get('enc_error_code') }, 'CCAvenue API returned an error');
    return null;
  }
  return JSON.parse(decrypt(out.get('enc_response')));
}

/** Attempts for an order, shaped like gateway payments: { id, status: captured|failed|created, amount (paise), method }. */
async function fetchOrderPayments(orderId) {
  const json = await callApi('orderStatusTracker', { reference_no: '', order_no: orderId });
  const r = json?.Order_Status_Result || json;
  if (!r || !r.order_status || (r.status !== undefined && Number(r.status) !== 0)) return [];
  const st = String(r.order_status).toLowerCase();
  const status = ['successful', 'success', 'shipped'].includes(st) ? 'captured' : ['unsuccessful', 'failure', 'aborted', 'invalid', 'timeout'].includes(st) ? 'failed' : 'created';
  return [{ id: r.reference_no, status, amount: toPaise(r.order_gross_amt || r.order_amt), method: r.order_card_name || undefined, bank: r.order_card_name || undefined }];
}

async function refund(paymentId, { amount, receipt }) {
  const json = await callApi('refundOrder', { reference_no: paymentId, refund_amount: rupees(amount), refund_ref_no: receipt });
  const r = json?.Refund_Order_Result || json;
  if (!r || Number(r.refund_status) !== 0) {
    const e = new Error(r?.error_desc || 'CCAvenue did not accept the refund');
    e.error = { description: r?.error_desc };
    throw e;
  }
  return { id: receipt, status: 'processed' };
}

function explain(err) {
  return `CCAvenue: ${err?.message || err}`;
}

module.exports = { assertConfigured, createOrder, paymentForm, parseResponse, fetchOrderPayments, refund, explain, encrypt, decrypt, toPaise };
