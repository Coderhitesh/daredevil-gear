'use strict';

// Combo / multi-buy offers, homepage offer posts, parcel size and the shipping-data admin tools.
const { setupDb, teardownDb, agent, adminAgent, seedCatalogue, captureEmails, fakeRazorpay, address, models } = require('../helpers');
const settings = require('../../src/services/settings.service');
const offerService = require('../../src/services/offer.service');
const shipping = require('../../src/services/shipping.service');

let catalog;
let admin;
let rzp;
let A;
let B;
let C;

beforeAll(async () => {
  await setupDb('offers');
  // three products at ₹1,180 each (GST 18% inclusive), no packaging charge
  catalog = await seedCatalogue({ products: 3, stock: 20, price: 118000, packaging: 0 });
  [A, B, C] = catalog.items.map((i) => i.product);
  await settings.set('shipping', { freeShippingEnabled: false, freeShippingThreshold: 500000, internationalMode: 'quote_only', defaultItemWeightKg: 1 });
  settings.clearCache();
  admin = await adminAgent('super_admin');
  rzp = fakeRazorpay();
});
afterAll(teardownDb);
beforeEach(() => {
  captureEmails();
  offerService.clearCache();
  settings.clearCache();
});

async function cartWith(a, entries) {
  for (const [p, qty] of entries) await a.post('/api/v1/cart/items').send({ productId: String(p._id), quantity: qty });
}
const quote = (a) => a.post('/api/v1/checkout/quote').send({});

describe('admin: offers', () => {
  test('combo price must be below what the items cost today', async () => {
    const res = await admin.agent.post('/api/v1/admin/offers').send({ name: 'Bad combo', type: 'bundle', items: [{ product: String(A._id), quantity: 1 }, { product: String(B._id), quantity: 1 }], bundlePrice: 236000 });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/lower than the items cost today \(₹2,360\)/);
  });

  test('a combo needs at least two units and no duplicates', async () => {
    const one = await admin.agent.post('/api/v1/admin/offers').send({ name: 'One item', type: 'bundle', items: [{ product: String(A._id), quantity: 1 }], bundlePrice: 100000 });
    expect(one.status).toBe(422);
    const dup = await admin.agent.post('/api/v1/admin/offers').send({ name: 'Dup', type: 'bundle', items: [{ product: String(A._id), quantity: 1 }, { product: String(A._id), quantity: 1 }], bundlePrice: 200000 });
    expect(dup.status).toBe(422);
  });

  test('multi-buy needs a % and products or categories', async () => {
    const res = await admin.agent.post('/api/v1/admin/offers').send({ name: 'No scope', type: 'multi_buy', minQuantity: 3, percentOff: 10 });
    expect(res.status).toBe(422);
  });
});

describe('combo offer in the cart and at checkout', () => {
  let combo;
  beforeAll(async () => {
    const res = await admin.agent.post('/api/v1/admin/offers').send({ name: 'Trek pair', description: 'Pack + torch together', type: 'bundle', items: [{ product: String(A._id), quantity: 1 }, { product: String(B._id), quantity: 1 }], bundlePrice: 200000, priority: 10 });
    expect(res.status).toBe(201);
    combo = res.body.data;
  });

  test('cart with both items pays the combo price; GST is on the lower price', async () => {
    const a = agent();
    await cartWith(a, [[A, 1], [B, 1]]);
    const t = (await quote(a)).body.data.totals;
    expect(t.offerDiscount).toBe(36000);
    expect(t.offers).toEqual([expect.objectContaining({ name: 'Trek pair', saving: 36000, times: 1 })]);
    expect(t.netItems).toBe(200000);
    expect(t.grandTotal).toBe(200000);
    // GST 18% included in ₹2,000 = 305.08
    expect(t.taxTotal).toBe(30508);
  });

  test('applies once per complete set; extra units pay full price', async () => {
    const a = agent();
    await cartWith(a, [[A, 3], [B, 2]]);
    const t = (await quote(a)).body.data.totals;
    expect(t.offers[0].times).toBe(2);
    expect(t.offerDiscount).toBe(72000);
    expect(t.grandTotal).toBe(5 * 118000 - 72000);
  });

  test('only part of the combo → no discount, but a hint to complete it', async () => {
    const a = agent();
    await cartWith(a, [[A, 1]]);
    const d = (await quote(a)).body.data;
    expect(d.totals.offerDiscount).toBe(0);
    expect(d.offerNudges[0]).toMatchObject({ name: 'Trek pair', type: 'bundle' });
  });

  test('"add combo to cart" puts every item in, and tops up a partial cart', async () => {
    const a = agent();
    await cartWith(a, [[A, 1]]);
    const res = await a.post(`/api/v1/cart/offers/${combo._id}`);
    expect(res.status).toBe(200);
    const items = res.body.data.items.map((i) => [i.product.id, i.quantity]).sort();
    expect(items).toEqual([[String(A._id), 1], [String(B._id), 1]].sort());
    expect(res.body.data.totals.offerDiscount).toBe(36000);
  });

  test('if prices change so the combo no longer saves money, it is not applied', async () => {
    await models.Product.updateOne({ _id: B._id }, { $set: { 'pricing.priceInclusive': 80000 } });
    try {
      const a = agent();
      await cartWith(a, [[A, 1], [B, 1]]);
      const t = (await quote(a)).body.data.totals;
      expect(t.offerDiscount).toBe(0);
      expect(t.grandTotal).toBe(198000);
    } finally {
      await models.Product.updateOne({ _id: B._id }, { $set: { 'pricing.priceInclusive': 118000 } });
    }
  });

  test('coupon does not stack with a non-combinable combo on the same items', async () => {
    await models.Coupon.create({ code: 'TREK10', type: 'percent', value: 10, isActive: true });
    const a = agent();
    await cartWith(a, [[A, 1], [B, 1]]);
    const res = await a.post('/api/v1/cart/coupon').send({ code: 'TREK10' });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/cannot be combined/);

    // with a third, non-combo item the coupon applies to that item only
    await cartWith(a, [[C, 1]]);
    const ok2 = await a.post('/api/v1/cart/coupon').send({ code: 'TREK10' });
    expect(ok2.status).toBe(200);
    expect(ok2.body.data.totals.discount).toBe(11800);
    expect(ok2.body.data.totals.offerDiscount).toBe(36000);
  });

  test('paid order stores the offer; product page and homepage list it', async () => {
    const a = agent();
    await cartWith(a, [[A, 1], [B, 1]]);
    const placed = await a.post('/api/v1/checkout/place').send({ idempotencyKey: `off-${Date.now()}`, shippingAddress: address, contact: { email: 'combo@example.com', name: 'Combo Buyer' } });
    expect(placed.status).toBe(201);
    await a.post('/api/v1/payments/razorpay/verify').send(rzp.pay(placed.body.data.razorpay.orderId));
    const order = await models.Order.findOne({ orderNumber: placed.body.data.orderNumber });
    expect(order.pricing.offerDiscount).toBe(36000);
    expect(order.pricing.offers[0]).toMatchObject({ name: 'Trek pair', saving: 36000 });
    expect(order.items.reduce((s, i) => s + i.netTotal, 0)).toBe(200000);

    const pp = await agent().get(`/api/v1/products/${A.slug}/offers`);
    expect(pp.body.data[0]).toMatchObject({ name: 'Trek pair', regularPrice: 236000, bundlePrice: 200000, saving: 36000 });
    expect(pp.body.data[0].items).toHaveLength(2);

    // offers used by orders cannot be deleted
    const del = await admin.agent.delete(`/api/v1/admin/offers/${combo._id}`);
    expect(del.status).toBe(409);
  });
});

describe('multi-buy offer', () => {
  test('buy 3+ from the category, 10% off; nudge below the minimum', async () => {
    await models.Offer.updateMany({}, { $set: { isActive: false } });
    const res = await admin.agent.post('/api/v1/admin/offers').send({ name: 'Any 3 save 10%', type: 'multi_buy', minQuantity: 3, percentOff: 10, eligibleCategories: [String(catalog.category._id)], combinableWithCoupons: true });
    expect(res.status).toBe(201);
    offerService.clearCache();

    const a = agent();
    await cartWith(a, [[A, 1], [C, 1]]);
    const two = (await quote(a)).body.data;
    expect(two.totals.offerDiscount).toBe(0);
    expect(two.offerNudges[0]).toMatchObject({ missing: 1 });

    await cartWith(a, [[B, 1]]);
    const three = (await quote(a)).body.data;
    expect(three.totals.offerDiscount).toBe(35400); // 10% of ₹3,540
    expect(three.totals.grandTotal).toBe(354000 - 35400);
  });
});

describe('homepage offers section', () => {
  test('offer posts link to their product; section listed on the homepage', async () => {
    const post = await admin.agent.post('/api/v1/admin/banners').send({ placement: 'offer', title: 'Monsoon pack deal', product: String(A._id), isActive: true });
    expect(post.status).toBe(201);
    await require('../../src/services/content.service').ensureSections();
    const home = await agent().get('/api/v1/storefront/home');
    const sec = home.body.data.find((s) => s.type === 'offers');
    expect(sec).toBeTruthy();
    expect(sec.posts[0]).toMatchObject({ title: 'Monsoon pack deal', linkHref: `/product/${A.slug}` });
    expect(sec.combos).toBeUndefined();
    // combos and multi-buys have their own section
    const combos = home.body.data.find((s2) => s2.type === 'combos');
    expect(combos).toBeTruthy();
    expect(combos.multiBuys[0]).toMatchObject({ type: 'multi_buy', percentOff: 10, link: `/category/${catalog.category.slug}` });
  });
});

describe('parcel size and shipping data', () => {
  test('parcel: default box without sizes, packed box from product sizes, billable = max(actual, volumetric)', () => {
    const p = (dims, w, qty = 1) => ({ product: { weightKg: w, dimensionsCm: dims }, variant: {}, quantity: qty });
    const box = { lengthCm: 30, breadthCm: 25, heightCm: 15 };
    const none = shipping.parcel([p(null, 0.5)], { fallbackKg: 1, box });
    expect(none).toMatchObject({ lengthCm: 30, breadthCm: 25, heightCm: 15, weightKg: 0.5, source: 'default_box' });

    // two 40×30×10 bags → 40×30×20 box, volumetric 4.8 kg beats 1.2 kg actual
    const two = shipping.parcel([p({ l: 40, w: 30, h: 10 }, 0.6, 2)], { fallbackKg: 1, box });
    expect(two).toMatchObject({ lengthCm: 40, breadthCm: 30, heightCm: 20, weightKg: 1.2, volumetricKg: 4.8, billableKg: 4.8, source: 'products' });

    // mixed: a small torch fits in the bag's footprint
    const mixed = shipping.parcel([p({ l: 40, w: 30, h: 10 }, 0.6), p({ l: 20, w: 5, h: 5 }, 0.3)], { fallbackKg: 1, box });
    expect(mixed).toMatchObject({ lengthCm: 40, breadthCm: 30, heightCm: 10.5 });
  });

  test('admin edits weight/size inline and via CSV; missing filter counts', async () => {
    const list = await admin.agent.get('/api/v1/admin/shipping-data?missing=1');
    expect(list.status).toBe(200);
    expect(list.body.meta.counts.missing).toBe(3);

    const patch = await admin.agent.patch(`/api/v1/admin/shipping-data/${A._id}`).send({ weightKg: 0.8, dimensionsCm: { l: 40, w: 30, h: 12 } });
    expect(patch.status).toBe(200);
    expect(patch.body.data).toMatchObject({ weightKg: 0.8, complete: true });
    expect((await models.ProductVariant.findOne({ product: A._id, isDefault: true })).weightKg).toBe(0.8);

    const csv = `sku,variant_sku,weight_kg,length_cm,width_cm,height_cm\n${B.sku},,0.4,22,8,8\n${C.sku},,abc,1,1,1\nNOPE-1,,1,1,1,1\n`;
    const imp = await admin.agent.post('/api/v1/admin/shipping-data/import').send({ csv });
    expect(imp.status).toBe(200);
    expect(imp.body.data.updated).toBe(1);
    expect(imp.body.data.skipped.map((s) => s.reason)).toEqual(['Numbers only (0–500)', 'SKU not found']);
    expect((await models.Product.findById(B._id)).dimensionsCm).toMatchObject({ l: 22, w: 8, h: 8 });

    const after = await admin.agent.get('/api/v1/admin/shipping-data?missing=1');
    expect(after.body.meta.counts.missing).toBe(1);

    const exp = await admin.agent.get('/api/v1/admin/shipping-data/export');
    expect(exp.text.split('\n')[0]).toBe('sku,variant_sku,name,weight_kg,length_cm,width_cm,height_cm');
  });
});
