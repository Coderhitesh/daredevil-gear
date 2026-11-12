'use strict';

// Cancellations, returns and returned-to-origin parcels — for online (CCAvenue) and cash-on-delivery orders.
const { setupDb, teardownDb, agent, adminAgent, seedCatalogue, captureEmails, address, models } = require('../helpers');
const settings = require('../../src/services/settings.service');
const ccavenue = require('../../src/services/ccavenue.service');
const refunds = require('../../src/services/refund.service');

let catalog;
let admin;
let sent;
let n = 0;

beforeAll(async () => {
  await setupDb('refund-flows');
  catalog = await seedCatalogue({ products: 2, stock: 20, price: 118000, packaging: 0 });
  await settings.set('checkout', { ...settings.DEFAULTS.checkout.value, codEnabled: true, codFee: 0, codMaxOpenOrders: 50 });
  await models.Coupon.create({ code: 'TREK10', type: 'percent', value: 10, isActive: true, usageLimit: 100 });
  settings.clearCache();
  admin = await adminAgent('super_admin');
});
afterAll(teardownDb);
beforeEach(() => {
  jest.restoreAllMocks();
  sent = captureEmails();
  settings.clearCache();
});

const stockOf = async (i = 0) => (await models.ProductVariant.findById(catalog.items[i].variant._id)).stock;
const couponUses = async () => (await models.Coupon.findOne({ code: 'TREK10' })).usageCount;

/** Places a COD order (no gateway needed); `online: true` turns it into a captured CCAvenue payment. */
async function placeOrder({ online = false, coupon = false, qty = 1 } = {}) {
  const a = agent();
  await a.post('/api/v1/cart/items').send({ productId: String(catalog.items[0].product._id), quantity: qty });
  if (coupon) await a.post('/api/v1/cart/coupon').send({ code: 'TREK10' });
  n += 1;
  const res = await a.post('/api/v1/checkout/place').send({ idempotencyKey: `rf-${n}-${Date.now()}`, paymentMethod: 'cod', shippingAddress: address, contact: { email: `buyer${n}@example.com`, name: 'Asha Verma', phone: `98${String(10000000 + n)}` } });
  expect(res.status).toBe(201);
  const order = await models.Order.findOne({ orderNumber: res.body.data.orderNumber });
  if (online) {
    await models.Order.updateOne({ _id: order._id }, { $set: { 'payment.provider': 'razorpay', 'payment.method': 'upi', 'payment.status': 'captured', 'payment.amountPaid': order.pricing.grandTotal, 'payment.razorpayPaymentId': `TRK${n}`, 'payment.paidAt': new Date() } });
  }
  return models.Order.findById(order._id);
}

async function ship(order) {
  const r = await admin.agent.post(`/api/v1/admin/orders/${order._id}/ship`).send({ carrier: 'Delhivery', trackingNumber: `AWB${order.orderNumber}` });
  expect(r.status).toBe(200);
}
async function deliver(order) {
  await ship(order);
  const r = await admin.agent.post(`/api/v1/admin/orders/${order._id}/status`).send({ status: 'delivered' });
  expect(r.status).toBe(200);
  return models.Order.findById(order._id);
}

describe('cancel before dispatch', () => {
  test('online order: full refund through CCAvenue, stock back, coupon use given back', async () => {
    const before = await stockOf();
    const order = await placeOrder({ online: true, coupon: true });
    const usesAfterOrder = await couponUses();
    const spy = jest.spyOn(ccavenue, 'refund').mockResolvedValue({ id: 'RF-CC-1', status: 'processed' });

    const res = await admin.agent.post(`/api/v1/admin/orders/${order._id}/cancel`).send({ reason: 'Customer asked to cancel' });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(order.payment.razorpayPaymentId, expect.objectContaining({ amount: order.pricing.grandTotal }));
    const after = await models.Order.findById(order._id);
    expect(after.status).toBe('cancelled');
    expect(after.payment.status).toBe('refunded');
    expect(await stockOf()).toBe(before);
    expect(await couponUses()).toBe(usesAfterOrder - 1);
  });

  test('COD order: no refund, stock back, coupon use given back', async () => {
    const before = await stockOf();
    const order = await placeOrder({ coupon: true });
    const usesAfterOrder = await couponUses();
    const res = await admin.agent.post(`/api/v1/admin/orders/${order._id}/cancel`).send({ reason: 'Changed mind' });
    expect(res.body.data.refund).toBeNull();
    expect(await stockOf()).toBe(before);
    expect(await couponUses()).toBe(usesAfterOrder - 1);
  });
});

describe('COD refunds wait for the bank / UPI payout', () => {
  test('return → refund_initiated keeps the refund pending; customer is told it is approved, not paid', async () => {
    const order = await deliver(await placeOrder({ qty: 2 }));
    const request = await refunds.createReturnRequest(order, { items: [{ orderItem: order.items[0]._id, quantity: 1 }], type: 'return', reason: 'Too big' }, null);
    for (const status of ['approved', 'received']) {
      const r = await admin.agent.patch(`/api/v1/admin/returns/${request._id}`).send({ status });
      expect(r.status).toBe(200);
    }
    sent.length = 0;
    const init = await admin.agent.patch(`/api/v1/admin/returns/${request._id}`).send({ status: 'refund_initiated' });
    expect(init.status).toBe(200);

    const refund = await models.Refund.findOne({ returnRequest: request._id });
    expect(refund).toMatchObject({ mode: 'manual', status: 'pending', amount: 118000 });
    expect((await models.ReturnRequest.findById(request._id)).status).toBe('refund_initiated');
    const o1 = await models.Order.findById(order._id);
    expect(o1.payment.status).toBe('captured'); // not "refunded" until the money has gone out
    expect(o1.status).toBe('returned');
    const mail = sent.find((m) => m.template === 'refund_update');
    expect(JSON.stringify(mail)).not.toMatch(/has been refunded/);

    // admin sends ₹1,180 by UPI and records it
    sent.length = 0;
    const bad = await admin.agent.post(`/api/v1/admin/refunds/${refund._id}/mark-paid`).send({ reference: '' });
    expect(bad.status).toBe(422);
    const paid = await admin.agent.post(`/api/v1/admin/refunds/${refund._id}/mark-paid`).send({ reference: 'UTR998877' });
    expect(paid.status).toBe(200);

    expect(await models.Refund.findById(refund._id)).toMatchObject({ status: 'processed', manualReference: 'UTR998877' });
    expect((await models.ReturnRequest.findById(request._id)).status).toBe('refunded');
    const o2 = await models.Order.findById(order._id);
    expect(o2.payment.status).toBe('partially_refunded');
    expect(o2.status).toBe('partially_refunded');
    expect(sent.some((m) => m.template === 'refund_update')).toBe(true);

    const again = await admin.agent.post(`/api/v1/admin/refunds/${refund._id}/mark-paid`).send({ reference: 'UTR998877' });
    expect(again.status).toBe(409);
  });

  test('"Issue a refund" on a COD order: pending without a reference, paid straight away with one', async () => {
    const order = await deliver(await placeOrder());
    const a = await admin.agent.post(`/api/v1/admin/orders/${order._id}/refunds`).send({ amount: 5000, reason: 'Goodwill', idempotencyKey: `gw-a-${order._id}` });
    expect(a.status).toBe(201);
    expect(a.body.data).toMatchObject({ status: 'pending', mode: 'manual' });
    const b = await admin.agent.post(`/api/v1/admin/orders/${order._id}/refunds`).send({ amount: 5000, reason: 'Delivery late', idempotencyKey: `gw-b-${order._id}`, manualReference: 'UPI-REF-1' });
    expect(b.body.data).toMatchObject({ status: 'processed', manualReference: 'UPI-REF-1' });
    // pending money still counts against the refundable balance
    const o = await models.Order.findById(order._id);
    expect(o.payment.amountRefunded).toBe(10000);
    const list = await admin.agent.get('/api/v1/admin/refunds?status=pending&mode=manual');
    expect(list.body.data.some((r) => String(r._id) === String(a.body.data._id))).toBe(true);
  });
});

describe('returned to origin (parcel came back undelivered)', () => {
  test('COD: order closed, stock back, coupon back, no refund, shipment marked RTO', async () => {
    const before = await stockOf();
    const order = await placeOrder({ coupon: true });
    const uses = await couponUses();
    await ship(order);
    const res = await admin.agent.post(`/api/v1/admin/orders/${order._id}/rto`).send({ reason: 'Customer refused at door', restock: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'cancelled', refund: null });
    const o = await models.Order.findById(order._id);
    expect(o.cancellation.by).toBe('rto');
    expect((await models.Shipment.findById(o.shipment)).status).toBe('rto');
    expect(await stockOf()).toBe(before);
    expect(await couponUses()).toBe(uses - 1);
    expect(sent.some((m) => m.template === 'order_cancelled')).toBe(true);
  });

  test('online: refunds the amount the admin chose; damaged parcel can stay out of stock', async () => {
    const before = await stockOf();
    const order = await placeOrder({ online: true });
    await ship(order);
    const spy = jest.spyOn(ccavenue, 'refund').mockResolvedValue({ id: 'RF-CC-2', status: 'processed' });
    const amount = order.pricing.grandTotal - order.pricing.shippingCharge;
    const res = await admin.agent.post(`/api/v1/admin/orders/${order._id}/rto`).send({ reason: 'Address not found', restock: false, refundAmount: amount });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(order.payment.razorpayPaymentId, expect.objectContaining({ amount }));
    expect(res.body.data.refund).toMatchObject({ amount, status: 'processed' });
    expect(await stockOf()).toBe(before - 1);
  });

  test('only for orders in transit', async () => {
    const order = await deliver(await placeOrder());
    const res = await admin.agent.post(`/api/v1/admin/orders/${order._id}/rto`).send({ reason: 'Too late' });
    expect(res.status).toBe(409);
  });
});
