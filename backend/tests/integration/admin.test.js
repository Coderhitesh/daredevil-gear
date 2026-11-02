'use strict';

const { setupDb, teardownDb, agent, adminAgent, createAdmin, seedCatalogue, captureEmails, models } = require('../helpers');
const { totp } = require('../../src/utils/crypto');

let admin;
let catalog;
beforeAll(async () => {
  await setupDb('admin');
  catalog = await seedCatalogue({ products: 1 });
  admin = await adminAgent('super_admin');
});
afterAll(teardownDb);
beforeEach(() => {
  jest.restoreAllMocks();
  captureEmails();
});

describe('admin authentication', () => {
  test('there is no public admin registration endpoint', async () => {
    const res = await agent().post('/api/v1/admin/auth/register').send({ email: 'x@y.z', password: 'whatever' });
    expect(res.status).toBe(401);
  });

  test('admin cannot use the dashboard until MFA is enrolled', async () => {
    const { user, password } = await createAdmin({ role: 'admin', email: 'nomfa@test.local' });
    const a = agent();
    await a.post('/api/v1/admin/auth/login').send({ email: user.email, password });
    const res = await a.get('/api/v1/admin/dashboard');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MFA_SETUP_REQUIRED');
  });

  test('enrolled admin must supply a valid TOTP code', async () => {
    const a = agent();
    const noCode = await a.post('/api/v1/admin/auth/login').send({ email: admin.user.email, password: 'Adm1nPassword!234' });
    expect(noCode.body.error.code).toBe('MFA_REQUIRED');
    const ok = await a.post('/api/v1/admin/auth/login').send({ email: admin.user.email, password: 'Adm1nPassword!234', totp: totp(admin.secret) });
    expect(ok.status).toBe(200);
  });

  test('customer accounts cannot reach admin APIs', async () => {
    const res = await agent().get('/api/v1/admin/products');
    expect(res.status).toBe(401);
  });

  test('admin actions are audit-logged', async () => {
    const logs = await models.AuditLog.find({ action: 'admin.login' }).lean();
    expect(logs.length).toBeGreaterThan(0);
  });
});

describe('role-based permissions (enforced on the server)', () => {
  test('support staff cannot edit products or issue refunds', async () => {
    const support = await adminAgent('support');
    expect((await support.agent.patch(`/api/v1/admin/products/${catalog.items[0].product._id}`).send({ name: 'Hacked name here' })).status).toBe(403);
    expect((await support.agent.get('/api/v1/admin/customers')).status).toBe(200);
  });

  test('catalog manager cannot manage admins or settings', async () => {
    const cm = await adminAgent('catalog_manager');
    expect((await cm.agent.get('/api/v1/admin/admins')).status).toBe(403);
    expect((await cm.agent.put('/api/v1/admin/settings/checkout').send({ value: {} })).status).toBe(403);
    expect((await cm.agent.get('/api/v1/admin/products')).status).toBe(200);
  });
});

describe('product & category CRUD', () => {
  let productId;

  test('create product → draft with generated SKU', async () => {
    const res = await admin.agent.post('/api/v1/admin/products').send({
      name: 'Field Hydration Pack',
      category: String(catalog.category._id),
      pricing: { priceInclusive: 236000, gstRate: 18, gstRule: 'fixed' },
      description: 'Two-litre hydration pack for long treks.',
      initialStock: 7,
    });
    expect(res.status).toBe(201);
    productId = res.body.data.product._id;
    expect(res.body.data.product.status).toBe('draft');
    expect(res.body.data.product.sku).toMatch(/^DDG-GEN-\d{3}$|^DDG-BAG-\d{3}$/);
    const v = await models.ProductVariant.findOne({ product: productId });
    expect(v.stock).toBe(7);
  });

  test('blocking claim prevents publishing until resolved', async () => {
    const upd = await admin.agent.patch(`/api/v1/admin/products/${productId}`).send({ description: 'Bulletproof and NIJ certified pack.' });
    expect(upd.status).toBe(200);
    const pub = await admin.agent.post(`/api/v1/admin/products/${productId}/status`).send({ status: 'published' });
    expect(pub.status).toBe(422);
    expect(pub.body.error.code).toBe('PUBLISH_BLOCKED');
    await admin.agent.patch(`/api/v1/admin/products/${productId}`).send({ description: 'Two-litre hydration pack for long treks.' });
    const ok = await admin.agent.post(`/api/v1/admin/products/${productId}/status`).send({ status: 'published' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('published');
  });

  test('a fake sale needs reference-price evidence', async () => {
    const res = await admin.agent.patch(`/api/v1/admin/products/${productId}`).send({ pricing: { priceInclusive: 236000, gstRate: 18, gstRule: 'fixed', sale: { active: true, priceInclusive: 200000 } } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SALE_EVIDENCE_REQUIRED');
  });

  test('manual edits are recorded so imports never overwrite them', async () => {
    const p = await models.Product.findById(productId);
    expect(p.manuallyEditedFields).toEqual(expect.arrayContaining(['description', 'pricing']));
  });

  test('category slug must be unique and cannot nest inside itself', async () => {
    const dup = await admin.agent.post('/api/v1/admin/categories').send({ name: 'Bags again', slug: 'bags-backpacks' });
    expect(dup.status).toBe(409);
    const child = await admin.agent.post('/api/v1/admin/categories').send({ name: 'Daypacks', slug: 'daypacks', parent: String(catalog.category._id) });
    expect(child.status).toBe(201);
    const loop = await admin.agent.patch(`/api/v1/admin/categories/${catalog.category._id}`).send({ parent: child.body.data._id });
    expect(loop.status).toBe(400);
  });

  test('deleting a category with products is refused', async () => {
    const res = await admin.agent.delete(`/api/v1/admin/categories/${catalog.category._id}`);
    expect(res.status).toBe(409);
  });

  test('stock adjustment requires a reason and records a movement', async () => {
    const v = await models.ProductVariant.findOne({ product: productId });
    const noReason = await admin.agent.post(`/api/v1/admin/inventory/${v._id}/adjust`).send({ quantity: 5, reason: '' });
    expect(noReason.status).toBe(422);
    const res = await admin.agent.post(`/api/v1/admin/inventory/${v._id}/adjust`).send({ quantity: -20, reason: 'Physical count' });
    expect(res.status).toBe(409); // cannot go negative
    const ok = await admin.agent.post(`/api/v1/admin/inventory/${v._id}/adjust`).send({ quantity: 3, reason: 'Received stock' });
    expect(ok.body.data.stock).toBe(10);
    expect(await models.InventoryMovement.countDocuments({ variant: v._id })).toBeGreaterThanOrEqual(2);
  });

  test('dashboard metrics come from the database', async () => {
    const res = await admin.agent.get('/api/v1/admin/dashboard?days=7');
    expect(res.status).toBe(200);
    expect(res.body.data.ordersPlaced).toBe(0);
    expect(res.body.data.revenue).toBe(0);
  });
});
