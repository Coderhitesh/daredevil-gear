'use strict';

/**
 * Shiprocket API client (https://apiv2.shiprocket.in/v1/external).
 *  - credentials: SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD of an *API user*
 *    (Shiprocket → Settings → API → Configure → Create an API user). Your normal login also works
 *    but Shiprocket recommends a dedicated API user.
 *  - behaviour (live rates, auto push, pickup address…) is controlled in Admin → Settings → Shiprocket.
 * Without credentials everything falls back to manual shipping (zones/rates in Admin).
 */
const env = require('../config/env');
const { ApiError } = require('../utils/http');
const logger = require('../config/logger');

const BASE = (env.SHIPROCKET_API_BASE || 'https://apiv2.shiprocket.in/v1/external').replace(/\/+$/, '');
const TIMEOUT_MS = 12_000;
let token = { value: null, exp: 0 };
let loggingIn = null;

function enabled() {
  return Boolean(env.SHIPROCKET_EMAIL && env.SHIPROCKET_PASSWORD);
}

function notConfigured() {
  return ApiError.unavailable('Shiprocket is not configured. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in backend/.env.', { code: 'PROVIDER_NOT_CONFIGURED' });
}

async function http(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (auth) headers.Authorization = `Bearer ${await getToken()}`;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const e = ApiError.unavailable('Could not reach Shiprocket. Please try again in a moment.', { code: 'SHIPROCKET_UNREACHABLE' });
    e.cause = err;
    e.retryable = true;
    throw e;
  }
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function login() {
  const { res, data } = await http('/auth/login', { method: 'POST', auth: false, body: { email: env.SHIPROCKET_EMAIL, password: env.SHIPROCKET_PASSWORD } });
  if (!res.ok || !data.token) {
    logger.error({ status: res.status, message: data?.message }, 'Shiprocket login failed');
    throw ApiError.unavailable(`Shiprocket login failed${data?.message ? `: ${data.message}` : ''}. Check SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD (use an API user).`, { code: 'SHIPROCKET_AUTH' });
  }
  // tokens are valid for 10 days; refresh a day early
  token = { value: data.token, exp: Date.now() + 9 * 86_400_000 };
  return token.value;
}

async function getToken() {
  if (!enabled()) throw notConfigured();
  if (token.value && token.exp > Date.now()) return token.value;
  if (!loggingIn) loggingIn = login().finally(() => (loggingIn = null));
  return loggingIn;
}

function message(data) {
  if (!data) return '';
  if (typeof data.message === 'string' && data.message) return data.message;
  if (data.errors && typeof data.errors === 'object') return Object.values(data.errors).flat().join('; ');
  return '';
}

/** Authenticated call; re-logs in once on 401 (token revoked/expired early). */
async function call(path, opts = {}) {
  if (!enabled()) throw notConfigured();
  let { res, data } = await http(path, opts);
  if (res.status === 401) {
    token = { value: null, exp: 0 };
    ({ res, data } = await http(path, opts));
  }
  if (!res.ok || data?.status_code >= 400) {
    const msg = message(data) || `HTTP ${res.status}`;
    logger.error({ path, status: res.status, msg }, 'Shiprocket API error');
    const e = res.status >= 500 ? ApiError.unavailable(`Shiprocket error: ${msg}`, { code: 'SHIPROCKET_ERROR' }) : ApiError.badRequest(`Shiprocket: ${msg}`, { code: 'SHIPROCKET_REJECTED' });
    e.shiprocketStatus = res.status;
    e.retryable = res.status >= 500 || res.status === 429;
    throw e;
  }
  return data;
}

// ---------------- rates ----------------

const rateCache = new Map(); // key -> { exp, value }
const RATE_TTL_MS = 10 * 60_000;

/**
 * Couriers that can deliver this parcel, with Shiprocket's charge for each.
 * Returns [] when the PIN code is not serviceable.
 */
async function serviceability({ pickupPincode, deliveryPincode, weightKg, declaredValue, lengthCm, breadthCm, heightCm, cod = false }) {
  const weight = Math.max(0.1, Math.round(weightKg * 1000) / 1000);
  const qs = new URLSearchParams({ pickup_postcode: String(pickupPincode), delivery_postcode: String(deliveryPincode), weight: String(weight), cod: cod ? '1' : '0' });
  if (declaredValue) qs.set('declared_value', String(Math.round(declaredValue / 100)));
  if (lengthCm && breadthCm && heightCm) {
    qs.set('length', String(lengthCm));
    qs.set('breadth', String(breadthCm));
    qs.set('height', String(heightCm));
  }
  const key = qs.toString();
  const hit = rateCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;

  let data;
  try {
    data = await call(`/courier/serviceability/?${key}`);
  } catch (err) {
    // Shiprocket answers 404/422 for PIN codes it cannot serve
    if ([404, 422].includes(err.shiprocketStatus)) data = { data: { available_courier_companies: [] } };
    else throw err;
  }
  const list = (data?.data?.available_courier_companies || [])
    .filter((c) => !c.blocked && Number(c.rate) > 0 && (!cod || c.cod === undefined || Number(c.cod) === 1))
    .map((c) => {
      const codCharges = cod ? Number(c.cod_charges) || 0 : 0;
      // freight = delivery itself; with cod=1 Shiprocket's `rate` also contains the COD handling charge
      const freight = c.freight_charge != null && Number(c.freight_charge) > 0 ? Number(c.freight_charge) : Math.max(0, Number(c.rate) - codCharges);
      return {
      courierId: Number(c.courier_company_id),
      courierName: c.courier_name,
      rate: freight, // rupees, delivery only
      codCharges, // rupees, courier's cash-collection charge (COD only)
      days: Number.parseInt(c.estimated_delivery_days, 10) || null,
      etd: c.etd || null,
      isSurface: Boolean(c.is_surface),
      rating: c.rating != null ? Number(c.rating) : null,
      };
    });
  const value = { couriers: list, recommendedId: Number(data?.data?.shiprocket_recommended_courier_id || data?.data?.recommended_courier_company_id) || null };
  rateCache.set(key, { exp: Date.now() + RATE_TTL_MS, value });
  if (rateCache.size > 2000) rateCache.delete(rateCache.keys().next().value);
  return value;
}

// ---------------- orders ----------------

const rupees = (paise) => Number(((paise || 0) / 100).toFixed(2));
const digits = (s) => String(s || '').replace(/\D/g, '');

function phone10(p) {
  const d = digits(p);
  return d.length > 10 ? d.slice(-10) : d;
}

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  if (parts.length < 2) return { first: parts[0] || 'Customer', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

function istDate(d) {
  // "YYYY-MM-DD HH:mm" in Indian time
  const t = new Date(new Date(d).getTime() + 330 * 60_000);
  return t.toISOString().slice(0, 16).replace('T', ' ');
}

function addressFields(a, prefix) {
  const n = splitName(a.fullName);
  return {
    [`${prefix}_customer_name`]: n.first,
    [`${prefix}_last_name`]: n.last,
    [`${prefix}_address`]: [a.line1, a.landmark].filter(Boolean).join(', '),
    [`${prefix}_address_2`]: a.line2 || '',
    [`${prefix}_city`]: a.city,
    [`${prefix}_pincode`]: String(a.pincode),
    [`${prefix}_state`]: a.state,
    [`${prefix}_country`]: 'India',
    [`${prefix}_phone`]: phone10(a.phone),
  };
}

/** Shiprocket "adhoc" order payload for a paid DareDevil Gears order. */
function orderPayload(order, cfg) {
  const ship = order.shippingAddress;
  const bill = order.billingAddress || ship;
  const KEYS = ['fullName', 'phone', 'line1', 'line2', 'landmark', 'city', 'state', 'pincode'];
  const sameAddress = !order.billingAddress || KEYS.every((k) => String(bill[k] || '') === String(ship[k] || ''));
  const p = order.pricing || {};
  const weight = order.delivery?.weightKg || cfg.defaultWeightKg || 0.5;
  return {
    order_id: order.orderNumber,
    order_date: istDate(order.placedAt || order.createdAt),
    pickup_location: cfg.pickupLocation || 'Primary',
    channel_id: cfg.channelId || undefined,
    comment: order.notes ? String(order.notes).slice(0, 200) : undefined,
    ...addressFields(bill, 'billing'),
    billing_email: order.email,
    shipping_is_billing: sameAddress,
    ...(sameAddress ? {} : { ...addressFields(ship, 'shipping'), shipping_email: order.email }),
    order_items: order.items.map((i) => ({
      name: [i.name, i.variantTitle && i.variantTitle !== 'Default' ? `(${i.variantTitle})` : ''].filter(Boolean).join(' ').slice(0, 200),
      sku: i.sku,
      units: i.quantity,
      selling_price: rupees(i.unitPriceInclusive),
      discount: i.discount ? rupees(i.discount / i.quantity) : 0,
      tax: i.gstRate ?? '',
      hsn: i.hsnCode || '',
    })),
    payment_method: order.payment?.provider === 'cod' ? 'COD' : 'Prepaid',
    shipping_charges: rupees(p.shippingCharge),
    // packaging + COD fee; for COD orders Shiprocket collects sub_total + shipping + transaction charges = order total
    transaction_charges: rupees((p.packagingCharge || 0) + (p.codCharge || 0)),
    total_discount: 0, // discounts are already applied per item above
    sub_total: rupees((p.itemsTotal || 0) - (p.discount || 0) - (p.offerDiscount || 0)),
    length: order.delivery?.lengthCm || cfg.lengthCm || 30,
    breadth: order.delivery?.breadthCm || cfg.breadthCm || 25,
    height: order.delivery?.heightCm || cfg.heightCm || 15,
    weight: Math.max(0.1, Math.round(weight * 1000) / 1000),
  };
}

async function createOrder(order, cfg) {
  const data = await call('/orders/create/adhoc', { method: 'POST', body: orderPayload(order, cfg) });
  if (!data?.order_id) throw ApiError.badRequest(`Shiprocket did not return an order id${message(data) ? `: ${message(data)}` : ''}`, { code: 'SHIPROCKET_REJECTED' });
  return { orderId: String(data.order_id), shipmentId: data.shipment_id ? String(data.shipment_id) : null, awb: data.awb_code || null, courierName: data.courier_name || null, status: data.status || null };
}

/** Find an order we may already have created (used before retrying a create that timed out). */
async function findOrder(orderNumber) {
  const data = await call(`/orders?search=${encodeURIComponent(orderNumber)}&per_page=10`);
  const hit = (data?.data || []).find((o) => String(o.channel_order_id) === String(orderNumber));
  if (!hit) return null;
  const s = hit.shipments?.[0] || {};
  return { orderId: String(hit.id), shipmentId: s.id ? String(s.id) : null, awb: s.awb || null, courierName: s.courier || null, status: hit.status || null };
}

async function assignAwb(shipmentId, courierId) {
  const body = { shipment_id: String(shipmentId) };
  if (courierId) body.courier_id = String(courierId);
  const data = await call('/courier/assign/awb', { method: 'POST', body });
  const d = data?.response?.data || {};
  if (!d.awb_code) throw ApiError.badRequest(`Shiprocket could not assign a courier${message(data?.response?.data) || message(data) ? `: ${message(data?.response?.data) || message(data)}` : ''}`, { code: 'SHIPROCKET_AWB' });
  return { awb: d.awb_code, courierName: d.courier_name || null, courierId: d.courier_company_id || courierId || null };
}

async function cancelOrders(orderIds) {
  return call('/orders/cancel', { method: 'POST', body: { ids: orderIds.map((x) => Number(x)) } });
}

async function track(awb) {
  const data = await call(`/courier/track/awb/${encodeURIComponent(awb)}`);
  const t = data?.tracking_data;
  return {
    status: t?.shipment_track?.[0]?.current_status,
    events: (t?.shipment_track_activities || []).map((e) => ({ status: e['sr-status-label'] || e.status, location: e.location, note: e.activity, at: e.date })),
    trackingUrl: t?.track_url,
  };
}

async function pickupLocations() {
  const data = await call('/settings/company/pickup');
  return (data?.data?.shipping_address || []).map((p) => ({ name: p.pickup_location, pincode: String(p.pin_code), city: p.city, state: p.state, primary: Boolean(p.is_primary_location) }));
}

/**
 * Legacy admin "ship via Shiprocket" action: reuse the pushed order when there is one,
 * otherwise create it, then assign a courier.
 */
async function createShipment(order, opts = {}) {
  const settings = require('./settings.service');
  const cfg = { ...(await settings.get('shiprocket')), ...opts };
  let sr = order.shiprocket?.shipmentId ? { orderId: order.shiprocket.orderId, shipmentId: order.shiprocket.shipmentId, awb: order.shiprocket.awb } : await createOrder(order, cfg);
  if (!sr.awb && sr.shipmentId) sr = { ...sr, ...(await assignAwb(sr.shipmentId, order.delivery?.courierId)) };
  return { providerRef: sr.shipmentId || sr.orderId, awb: sr.awb || null, orderId: sr.orderId, shipmentId: sr.shipmentId, courierName: sr.courierName };
}

function clearCache() {
  rateCache.clear();
  token = { value: null, exp: 0 };
}

module.exports = { enabled, login, call, serviceability, orderPayload, createOrder, findOrder, assignAwb, cancelOrders, track, pickupLocations, createShipment, clearCache };
