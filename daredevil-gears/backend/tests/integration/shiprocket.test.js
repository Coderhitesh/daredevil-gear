'use strict';

// Shiprocket is replaced by a local mock API (same paths and response shapes as apiv2.shiprocket.in).
const http = require('http');

const PORT = 27000 + Math.floor(Math.random() * 900);
process.env.SHIPROCKET_EMAIL = 'api-user@example.com';
process.env.SHIPROCKET_PASSWORD = 'sr-api-pass';
process.env.SHIPROCKET_API_BASE = `http://127.0.0.1:${PORT}/v1/external`;

const { setupDb, teardownDb, agent, adminAgent, seedCatalogue, captureEmails, fakeRazorpay, address, models } = require('../helpers');
const settings = require('../../src/services/settings.service');
const sr = require('../../src/services/shipping-provider.service');

const mock = { calls: [], created: [], cancelled: [], failCreate: 0, serviceable: true, logins: 0 };
let server;

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function startMock() {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const body = raw ? JSON.parse(raw) : null;
      const path = url.pathname.replace('/v1/external', '');
      mock.calls.push({ method: req.method, path, query: Object.fromEntries(url.searchParams), body, auth: req.headers.authorization });
      if (path === '/auth/login') {
        mock.logins++;
        return body.password === 'sr-api-pass' ? json(res, 200, { token: 'sr-token-1' }) : json(res, 400, { message: 'Invalid email and password combination' });
      }
      if (req.headers.authorization !== 'Bearer sr-token-1') return json(res, 401, { message: 'Unauthenticated.' });
      if (path === '/courier/serviceability/') {
        if (!mock.serviceable) return json(res, 404, { status: 404, message: 'Delivery postcode not serviceable' });
        return json(res, 200, {
          status: 200,
          data: {
            shiprocket_recommended_courier_id: 51,
            available_courier_companies: [
              { courier_company_id: 51, courier_name: 'Xpressbees Surface', rate: 112.5, estimated_delivery_days: '5', etd: 'Nov 06, 2026', is_surface: true },
              { courier_company_id: 10, courier_name: 'Delhivery Surface', rate: 98.4, estimated_delivery_days: '6', etd: 'Nov 07, 2026', is_surface: true },
              { courier_company_id: 24, courier_name: 'Blue Dart Air', rate: 241, estimated_delivery_days: '2', etd: 'Nov 03, 2026', is_surface: false },
            ],
          },
        });
      }
      if (path === '/orders/create/adhoc') {
        if (mock.failCreate > 0) {
          mock.failCreate--;
          return json(res, 422, { message: 'Wrong Pickup location entered. Primary pickup location name is "Warehouse"', status_code: 422 });
        }
        const id = 900000 + mock.created.length + 1;
        mock.created.push(body);
        return json(res, 200, { order_id: id, shipment_id: id + 5000, status: 'NEW', status_code: 1, awb_code: '', courier_name: '' });
      }
      if (path === '/orders' && req.method === 'GET') return json(res, 200, { data: [] });
      if (path === '/courier/assign/awb') return json(res, 200, { awb_assign_status: 1, response: { data: { awb_code: 'AWB778899', courier_name: 'Delhivery Surface', courier_company_id: Number(body.courier_id) } } });
      if (path === '/orders/cancel') {
        mock.cancelled.push(...body.ids);
        return json(res, 200, { message: 'Order cancelled' });
      }
      if (path === '/settings/company/pickup') return json(res, 200, { data: { shipping_address: [{ pickup_location: 'Primary', pin_code: 201301, city: 'Noida', state: 'Uttar Pradesh', is_primary_location: 1 }] } });
      return json(res, 404, { message: `mock: no route ${path}` });
    });
  });
  return new Promise((r) => server.listen(PORT, '127.0.0.1', r));
}

const waitFor = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 50));
  }
};

let catalog;
let rzp;
let admin;

beforeAll(async () => {
  await startMock();
  await setupDb('shiprocket');
  // 2 items x 0.6 kg each = 1.2 kg parcel; price ₹1,180 incl. GST; no free delivery so charges are visible
  catalog = await seedCatalogue({ products: 2, stock: 5, price: 118000, packaging: 0 });
  await models.Product.updateMany({}, { $set: { weightKg: 0.6 } });
  await settings.set('shipping', { freeShippingEnabled: false, freeShippingThreshold: 500000, internationalMode: 'quote_only', defaultItemWeightKg: 1 });
  await settings.set('shiprocket', { ...settings.DEFAULTS.shiprocket.value, pickupPincode: '201301', pickupLocation: 'Primary' });
  settings.clearCache();
  admin = await adminAgent('super_admin');
  rzp = fakeRazorpay();
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

async function cartWith(a, qty = 2) {
  await a.post('/api/v1/cart/items').send({ productId: String(catalog.items[0].product._id), quantity: qty });
}

describe('Shiprocket live delivery charges', () => {
  test('checkout quote shows Shiprocket rates for the PIN code (cheapest + faster option)', async () => {
    const a = agent();
    await cartWith(a);
    const res = await a.post('/api/v1/checkout/quote').send({ pincode: '110001', state: 'Delhi', country: 'IN' });
    expect(res.status).toBe(200);
    const opts = res.body.data.shipping.options;
    expect(opts).toHaveLength(2);
    expect(opts[0]).toMatchObject({ rateId: 'sr_10', courierName: 'Delhivery Surface', charge: 9840, method: 'standard', etd: 'Nov 07, 2026' });
    expect(opts[1]).toMatchObject({ rateId: 'sr_24', courierName: 'Blue Dart Air', charge: 24100, method: 'express' });
    // delivery charge is part of the total the customer pays
    expect(res.body.data.totals.shippingCharge).toBe(9840);

    const q = mock.calls.filter((c) => c.path === '/courier/serviceability/').pop().query;
    expect(q).toMatchObject({ pickup_postcode: '201301', delivery_postcode: '110001', weight: '1.2', cod: '0' });
  });

  test('product page PIN check uses the same live rate', async () => {
    const slug = catalog.items[0].product.slug;
    const res = await agent().get(`/api/v1/products/${slug}/delivery?pincode=400001`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ serviceable: true, provider: 'shiprocket', charge: 9840 });
  });

  test('unserviceable PIN codes are refused clearly', async () => {
    mock.serviceable = false;
    try {
      const a = agent();
      await cartWith(a, 1);
      const res = await a.post('/api/v1/checkout/quote').send({ pincode: '799999', state: 'Tripura', country: 'IN' });
      expect(res.body.data.shippingError.code).toBe('NOT_SERVICEABLE');
    } finally {
      mock.serviceable = true;
    }
  });

  test('GST / handling options change the charge exactly as configured', async () => {
    await settings.set('shiprocket', { ...(await settings.get('shiprocket')), addGstToRate: true, handlingCharge: 1000, courierChoice: 'cheapest' });
    settings.clearCache();
    try {
      const a = agent();
      await cartWith(a);
      const res = await a.post('/api/v1/checkout/quote').send({ pincode: '110001', state: 'Delhi' });
      expect(res.body.data.shipping.options).toHaveLength(1);
      expect(res.body.data.shipping.options[0].charge).toBe(Math.round(98.4 * 1.18 * 100) + 1000);
    } finally {
      await settings.set('shiprocket', { ...(await settings.get('shiprocket')), addGstToRate: false, handlingCharge: 0, courierChoice: 'cheapest_and_fastest' });
      settings.clearCache();
    }
  });
});

describe('orders are sent to Shiprocket after payment', () => {
  test('paid order is saved in our DB and created in Shiprocket automatically', async () => {
    const a = agent();
    await cartWith(a);
    const placed = await a.post('/api/v1/checkout/place').send({ idempotencyKey: `k-${Date.now()}`, shippingAddress: { ...address, pincode: '110001', state: 'Delhi', city: 'New Delhi' }, contact: { email: 'buyer@example.com', name: 'Asha Verma' }, rateId: 'sr_24' });
    expect(placed.status).toBe(201);
    const orderNumber = placed.body.data.orderNumber;

    let order = await models.Order.findOne({ orderNumber });
    expect(order.delivery).toMatchObject({ provider: 'shiprocket', courierId: 24, courierName: 'Blue Dart Air', weightKg: 1.2 });
    expect(order.pricing.shippingCharge).toBe(24100);
    expect(order.shiprocket.status).toBe('not_sent'); // nothing is sent before payment
    expect(mock.created).toHaveLength(0);

    const pay = await a.post('/api/v1/payments/razorpay/verify').send(rzp.pay(placed.body.data.razorpay.orderId));
    expect(pay.status).toBe(200);

    order = await waitFor(async () => {
      const o = await models.Order.findOne({ orderNumber });
      return o.shiprocket.status === 'pushed' ? o : null;
    });
    expect(order.shiprocket).toMatchObject({ orderId: '900001', shipmentId: '905001', attempts: 1 });

    const payload = mock.created[0];
    expect(payload).toMatchObject({
      order_id: orderNumber,
      pickup_location: 'Primary',
      payment_method: 'Prepaid',
      billing_customer_name: 'Asha',
      billing_last_name: 'Verma',
      billing_pincode: '110001',
      billing_phone: '9876543210',
      billing_email: 'buyer@example.com',
      shipping_is_billing: true,
      shipping_charges: 241,
      weight: 1.2,
    });
    expect(payload.order_items[0]).toMatchObject({ units: 2, selling_price: 1180 });
    expect(payload.sub_total).toBe(2360);
  });

  test('a rejected push is shown to the admin and can be retried without duplicates', async () => {
    mock.failCreate = 1;
    const a = agent();
    await cartWith(a, 1);
    const placed = await a.post('/api/v1/checkout/place').send({ idempotencyKey: `k2-${Date.now()}`, shippingAddress: { ...address, pincode: '110001', state: 'Delhi', city: 'New Delhi' }, contact: { email: 'b2@example.com', name: 'B Two' } });
    await a.post('/api/v1/payments/razorpay/verify').send(rzp.pay(placed.body.data.razorpay.orderId));
    const orderNumber = placed.body.data.orderNumber;

    const failed = await waitFor(async () => {
      const o = await models.Order.findOne({ orderNumber });
      return o.shiprocket.status === 'failed' ? o : null;
    });
    expect(failed.shiprocket.lastError).toMatch(/Wrong Pickup location/);

    const detail = await admin.agent.get(`/api/v1/admin/orders/${failed._id}`);
    expect(detail.body.data.shiprocket.status).toBe('failed');
    expect(detail.body.data.shippingProvider).toBe('shiprocket');

    const before = mock.created.length;
    const retry = await admin.agent.post(`/api/v1/admin/orders/${failed._id}/shiprocket/push`);
    expect(retry.status).toBe(200);
    expect(retry.body.data.status).toBe('pushed');
    expect(mock.created.length).toBe(before + 1);

    // pushing again does not create a second Shiprocket order
    await admin.agent.post(`/api/v1/admin/orders/${failed._id}/shiprocket/push`);
    expect(mock.created.length).toBe(before + 1);
  });

  test('auto-assign courier books the courier the customer chose', async () => {
    await settings.set('shiprocket', { ...(await settings.get('shiprocket')), autoAssignCourier: true });
    settings.clearCache();
    try {
      const a = agent();
      await cartWith(a, 1);
      const placed = await a.post('/api/v1/checkout/place').send({ idempotencyKey: `k3-${Date.now()}`, shippingAddress: { ...address, pincode: '110001', state: 'Delhi', city: 'New Delhi' }, contact: { email: 'b3@example.com', name: 'B Three' } });
      await a.post('/api/v1/payments/razorpay/verify').send(rzp.pay(placed.body.data.razorpay.orderId));
      const o = await waitFor(async () => {
        const x = await models.Order.findOne({ orderNumber: placed.body.data.orderNumber });
        return x.shiprocket.status === 'awb_assigned' ? x : null;
      });
      expect(o.shiprocket.awb).toBe('AWB778899');
      const assign = mock.calls.filter((c) => c.path === '/courier/assign/awb').pop();
      expect(assign.body).toEqual({ shipment_id: o.shiprocket.shipmentId, courier_id: '10' });
    } finally {
      await settings.set('shiprocket', { ...(await settings.get('shiprocket')), autoAssignCourier: false });
      settings.clearCache();
    }
  });

  test('cancelling the order cancels it in Shiprocket too', async () => {
    const o = await models.Order.findOne({ 'shiprocket.status': 'pushed' }).sort({ createdAt: 1 });
    const res = await admin.agent.post(`/api/v1/admin/orders/${o._id}/cancel`).send({ reason: 'Customer asked to cancel' });
    expect(res.status).toBe(200);
    expect(mock.cancelled).toContain(Number(o.shiprocket.orderId));
    expect((await models.Order.findById(o._id)).shiprocket.status).toBe('cancelled');
  });

  test('admin can test the connection and see live rates', async () => {
    const res = await admin.agent.post('/api/v1/admin/settings/shiprocket/test').send({ pincode: '560001', weightKg: 0.5 });
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
    expect(res.body.data.locations[0]).toMatchObject({ name: 'Primary', pincode: '201301' });
    expect(res.body.data.couriers).toHaveLength(3);
  });
});
