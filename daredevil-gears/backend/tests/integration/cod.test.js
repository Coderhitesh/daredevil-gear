'use strict';

// Cash on delivery, with Shiprocket replaced by a local mock (COD couriers + cod_charges).
const http = require('http');

const PORT = 28000 + Math.floor(Math.random() * 900);
process.env.SHIPROCKET_EMAIL = 'api-user@example.com';
process.env.SHIPROCKET_PASSWORD = 'sr-api-pass';
process.env.SHIPROCKET_API_BASE = `http://127.0.0.1:${PORT}/v1/external`;

const { setupDb, teardownDb, agent, adminAgent, seedCatalogue, captureEmails, fakeRazorpay, address, models } = require('../helpers');
const settings = require('../../src/services/settings.service');
const sr = require('../../src/services/shipping-provider.service');
const { hashPassword } = require('../../src/services/password.service');

const mock = { created: [], codPins: new Set(['110001', '400001']) };
let server;

function startMock() {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const path = url.pathname.replace('/v1/external', '');
      const body = raw ? JSON.parse(raw) : null;
      const j = (s, b) => {
        res.writeHead(s, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(b));
      };
      if (path === '/auth/login') return j(200, { token: 't' });
      if (path === '/courier/serviceability/') {
        const cod = url.searchParams.get('cod') === '1';
        const pin = url.searchParams.get('delivery_postcode');
        if (cod && !mock.codPins.has(pin)) return j(404, { message: 'COD not available' });
        const list = [
          // with cod=1 Shiprocket's rate includes the COD charge
          { courier_company_id: 10, courier_name: 'Delhivery Surface', freight_charge: 80, cod_charges: cod ? 35 : 0, rate: cod ? 115 : 80, cod: 1, estimated_delivery_days: '5', etd: 'Nov 06, 2026' },
          { courier_company_id: 24, courier_name: 'Blue Dart Air', freight_charge: 200, cod_charges: cod ? 50 : 0, rate: cod ? 250 : 200, cod: 0, estimated_delivery_days: '2', etd: 'Nov 03, 2026' },
        ];
        return j(200, { data: { available_courier_companies: list } });
      }
      if (path === '/orders/create/adhoc') {
        mock.created.push(body);
        return j(200, { order_id: 800000 + mock.created.length, shipment_id: 810000 + mock.created.length });
      }
      if (path === '/orders') return j(200, { data: [] });
      if (path === '/orders/cancel') return j(200, {});
      return j(404, { message: 'no route' });
    });
  });
  return new Promise((r) => server.listen(PORT, '127.0.0.1', r));
}

const waitFor = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
};

let catalog;
let admin;
let checkoutCfg;
const delhi = { ...address, pincode: '110001', state: 'Delhi', city: 'New Delhi' };

async function setCheckout(patch) {
  await settings.set('checkout', { ...checkoutCfg, ...patch });
  settings.clearCache();
}

beforeAll(async () => {
  await startMock();
  await setupDb('cod');
  catalog = await seedCatalogue({ products: 2, stock: 10, price: 118000, packaging: 0 });
  await models.Product.updateMany({}, { $set: { weightKg: 0.5 } });
  await settings.set('shipping', { freeShippingEnabled: false, freeShippingThreshold: 500000, internationalMode: 'quote_only', defaultItemWeightKg: 1 });
  await settings.set('shiprocket', { ...settings.DEFAULTS.shiprocket.value, pickupPincode: '201301', pickupLocation: 'Primary' });
  checkoutCfg = { ...settings.DEFAULTS.checkout.value, codEnabled: true, codFee: 2000, codAddCourierCharge: true };
  await settings.set('checkout', checkoutCfg);
  settings.clearCache();
  admin = await adminAgent('super_admin');
  fakeRazorpay();
});
afterAll(async () => {
  await teardownDb();
  await new Promise((r) => server.close(r));
});
beforeEach(() => {
  captureEmails();
  sr.clearCache();
  settings.clearCache();
});

async function cart(a, qty = 1, idx = 0) {
  await a.post('/api/v1/cart/items').send({ productId: String(catalog.items[idx].product._id), quantity: qty });
}
const placeCod = (a, body = {}) => a.post('/api/v1/checkout/place').send({ idempotencyKey: `cod-${Math.random().toString(36).slice(2, 12)}`, paymentMethod: 'cod', shippingAddress: delhi, contact: { email: 'cod@example.com', name: 'Asha Verma', phone: '9876543210' }, ...body });

describe('quote', () => {
  test('online vs COD: COD shows only COD couriers, same delivery charge, separate COD fee', async () => {
    const a = agent();
    await cart(a);
    const online = await a.post('/api/v1/checkout/quote').send({ pincode: '110001', state: 'Delhi' });
    expect(online.body.data.cod).toMatchObject({ enabled: true, available: true, selected: false, fee: 0 });
    expect(online.body.data.shipping.options.map((o) => o.rateId)).toEqual(['sr_10', 'sr_24']);

    const cod = await a.post('/api/v1/checkout/quote').send({ pincode: '110001', state: 'Delhi', paymentMethod: 'cod' });
    const d = cod.body.data;
    expect(d.shipping.options.map((o) => o.rateId)).toEqual(['sr_10']); // Blue Dart does not do COD here
    expect(d.shipping.options[0].charge).toBe(8000); // delivery stays the freight charge
    expect(d.cod).toMatchObject({ selected: true, fee: 2000 + 3500 }); // fixed ₹20 + courier ₹35
    expect(d.totals.codCharge).toBe(5500);
    expect(d.totals.grandTotal).toBe(118000 + 8000 + 5500);
  });

  test('PIN codes without COD fall back to online with a reason', async () => {
    const a = agent();
    await cart(a);
    const res = await a.post('/api/v1/checkout/quote').send({ pincode: '560001', state: 'Karnataka', paymentMethod: 'cod' });
    expect(res.body.data.cod).toMatchObject({ available: false, selected: false });
    expect(res.body.data.cod.reason).toMatch(/not available for this PIN code/);
    expect(res.body.data.totals.codCharge).toBe(0);
    expect(res.body.data.shipping.options.length).toBeGreaterThan(0);
  });

  test('order value limit is enforced', async () => {
    await setCheckout({ codMaxOrderValue: 100000 });
    try {
      const a = agent();
      await cart(a);
      const q = await a.post('/api/v1/checkout/quote').send({ pincode: '110001', state: 'Delhi', paymentMethod: 'cod' });
      expect(q.body.data.cod.available).toBe(false);
      expect(q.body.data.cod.reason).toMatch(/up to ₹1,000/);
      const placed = await placeCod(a);
      expect(placed.status).toBe(422);
      expect(placed.body.error.code).toBe('COD_NOT_AVAILABLE');
    } finally {
      await setCheckout({ codMaxOrderValue: 0 });
    }
  });
});

describe('placing a COD order', () => {
  let orderId;

  test('order is confirmed immediately, stock committed, no Razorpay, sent to Shiprocket as COD', async () => {
    const a = agent();
    await cart(a, 2);
    const before = await models.ProductVariant.findById(catalog.items[0].variant._id);
    const res = await placeCod(a);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ paymentMethod: 'cod', status: 'confirmed', amountDue: 236000 + 8000 + 5500 });
    expect(res.body.data.razorpay).toBeUndefined();
    expect(res.body.data.guestAccessToken).toBeTruthy();

    const order = await models.Order.findOne({ orderNumber: res.body.data.orderNumber });
    orderId = order._id;
    expect(order.status).toBe('confirmed');
    expect(order.payment).toMatchObject({ provider: 'cod', method: 'cod', status: 'cod_pending', amountPaid: 0 });
    expect(order.pricing.codCharge).toBe(5500);
    expect(order.invoice.number).toBeTruthy();
    expect(order.expiresAt).toBeUndefined();
    const after = await models.ProductVariant.findById(catalog.items[0].variant._id);
    expect(after.stock).toBe(before.stock - 2);

    // guest cart emptied
    expect((await a.get('/api/v1/cart')).body.data.count).toBe(0);

    await waitFor(async () => (await models.Order.findById(orderId)).shiprocket.status === 'pushed');
    const p = mock.created.pop();
    expect(p).toMatchObject({ payment_method: 'COD', shipping_charges: 80, transaction_charges: 55, sub_total: 2360 });
    // Shiprocket collects sub_total + shipping + transaction charges = what the customer owes
    expect(Math.round((p.sub_total + p.shipping_charges + p.transaction_charges) * 100)).toBe(order.pricing.grandTotal);
  });

  test('marking it delivered records the cash as collected', async () => {
    const o = await models.Order.findById(orderId);
    for (const s of ['processing']) await admin.agent.post(`/api/v1/admin/orders/${o._id}/status`).send({ status: s });
    await admin.agent.post(`/api/v1/admin/orders/${o._id}/ship`).send({ carrier: 'Delhivery', trackingNumber: 'AWB-COD-1' });
    const del = await admin.agent.post(`/api/v1/admin/orders/${o._id}/status`).send({ status: 'delivered' });
    expect(del.status).toBe(200);
    const done = await models.Order.findById(orderId);
    expect(done.payment).toMatchObject({ status: 'captured', amountPaid: done.pricing.grandTotal });
    expect(done.payment.paidAt).toBeTruthy();
  });

  test('refund on a delivered COD order is a manual (bank/UPI) refund — no Razorpay call', async () => {
    const res = await admin.agent.post(`/api/v1/admin/orders/${orderId}/refunds`).send({ amount: 10000, reason: 'Goodwill credit', idempotencyKey: 'cod-refund-0001', manualReference: 'UTR123456' });
    expect(res.status).toBe(201);
    const r = await models.Refund.findOne({ order: orderId });
    expect(r).toMatchObject({ mode: 'manual', status: 'processed', manualReference: 'UTR123456', amount: 10000 });
    expect((await models.Order.findById(orderId)).payment.status).toBe('partially_refunded');
  });

  test('cancelling an undelivered COD order restocks and refunds nothing', async () => {
    const a = agent();
    await cart(a, 1, 1);
    const before = (await models.ProductVariant.findById(catalog.items[1].variant._id)).stock;
    const res = await placeCod(a, { contact: { email: 'cancel@example.com', name: 'Test Buyer', phone: '9811111111' } });
    const o = await models.Order.findOne({ orderNumber: res.body.data.orderNumber });
    expect((await models.ProductVariant.findById(catalog.items[1].variant._id)).stock).toBe(before - 1);
    const c = await admin.agent.post(`/api/v1/admin/orders/${o._id}/cancel`).send({ reason: 'Customer changed mind' });
    expect(c.status).toBe(200);
    expect(c.body.data.refund).toBeNull();
    expect((await models.ProductVariant.findById(catalog.items[1].variant._id)).stock).toBe(before);
    expect(await models.Refund.countDocuments({ order: o._id })).toBe(0);
  });

  test('repeat submit returns the same COD order', async () => {
    const a = agent();
    await cart(a);
    const key = 'cod-same-key-1';
    const one = await placeCod(a, { idempotencyKey: key, contact: { email: 'idem@example.com', name: 'Test Buyer', phone: '9822222222' } });
    const two = await placeCod(a, { idempotencyKey: key, contact: { email: 'idem@example.com', name: 'Test Buyer', phone: '9822222222' } });
    expect(two.status).toBe(201);
    expect(two.body.data.orderNumber).toBe(one.body.data.orderNumber);
    expect(await models.Order.countDocuments({ email: 'idem@example.com' })).toBe(1);
  });

  test('too many open COD orders for one customer are refused', async () => {
    await setCheckout({ codMaxOpenOrders: 1 });
    try {
      const a = agent();
      await cart(a);
      const first = await placeCod(a, { contact: { email: 'limit@example.com', name: 'Test Buyer', phone: '9833333333' } });
      expect(first.status).toBe(201);
      await cart(a);
      const second = await placeCod(a, { contact: { email: 'limit@example.com', name: 'Test Buyer', phone: '9833333333' } });
      expect(second.status).toBe(422);
      expect(second.body.error.code).toBe('COD_LIMIT');
    } finally {
      await setCheckout({ codMaxOpenOrders: 3 });
    }
  });

  test('COD works without Razorpay keys, and can be switched off or limited to signed-in customers', async () => {
    await setCheckout({ codGuestAllowed: false });
    const a = agent();
    await cart(a);
    const guest = await placeCod(a, { contact: { email: 'g@example.com', name: 'Test Buyer', phone: '9844444444' } });
    expect(guest.body.error.code).toBe('COD_NOT_AVAILABLE');

    await models.User.create({ name: 'Ravi', email: 'ravi@example.com', role: 'customer', status: 'active', emailVerified: true, passwordHash: await hashPassword('Ravi-Pass-2026x') });
    const u = agent();
    await u.post('/api/v1/auth/login').send({ email: 'ravi@example.com', password: 'Ravi-Pass-2026x' });
    await cart(u);
    expect((await placeCod(u, { contact: { phone: '9855555555' } })).status).toBe(201);

    await setCheckout({ codGuestAllowed: true, codEnabled: false });
    await cart(u);
    expect((await placeCod(u, { contact: { phone: '9855555555' } })).body.error.code).toBe('COD_NOT_AVAILABLE');
    await setCheckout({ codEnabled: true });

    const cfg = await agent().get('/api/v1/checkout/config');
    expect(cfg.body.data).toMatchObject({ codEnabled: true, codFee: 2000 });
  });
});
