'use strict';

const path = require('path');
const mongoose = require('mongoose');
const request = require('supertest');
const { connectDB } = require('../src/config/db');
const { createApp } = require('../src/app');
const models = require('../src/models');
const { hashPassword } = require('../src/services/password.service');
const { totp } = require('../src/utils/crypto');
const settings = require('../src/services/settings.service');
const tax = require('../src/services/tax.service');
const email = require('../src/services/email.service');
const razorpay = require('../src/services/razorpay.service');
const { hmacSha256 } = require('../src/utils/crypto');

let app;

async function setupDb(name) {
  const base = process.env.MONGODB_URI.replace(/\/[^/]*$/, '');
  await connectDB(`${base}/ddg_test_${name}`);
  await mongoose.connection.db.dropDatabase();
  settings.clearCache();
  await settings.ensureDefaults();
  await tax.ensureDefault();
  app = createApp();
  return app;
}

async function teardownDb() {
  await mongoose.connection.db.dropDatabase().catch(() => {});
  await mongoose.disconnect();
}

/** supertest agent that keeps cookies and sends the CSRF header. */
function agent() {
  const a = request.agent(app);
  const wrap = (method) => (url) => a[method](url).set('x-ddg-csrf', '1');
  return { get: (url) => a.get(url), post: wrap('post'), patch: wrap('patch'), put: wrap('put'), delete: wrap('delete'), raw: a };
}

/** Capture emails instead of sending them. Returns array of { template, to, data }. */
function captureEmails() {
  const sent = [];
  jest.spyOn(email, 'send').mockImplementation(async (template, to, data) => {
    sent.push({ template, to, data });
    return { delivered: true };
  });
  jest.spyOn(email, 'notifyAdmins').mockResolvedValue(undefined);
  return sent;
}

async function createAdmin({ role = 'super_admin', email: addr = `${role}@test.local`, password = 'Adm1nPassword!234' } = {}) {
  const user = await models.User.create({ name: `${role} user`, email: addr, role, status: 'active', emailVerified: true, passwordHash: await hashPassword(password) });
  return { user, password };
}

/** Log in as admin and complete MFA enrolment → returns an authenticated agent. */
async function adminAgent(role = 'super_admin') {
  const { user, password } = await createAdmin({ role });
  const a = agent();
  const login = await a.post('/api/v1/admin/auth/login').send({ email: user.email, password });
  if (login.status !== 200) throw new Error(`admin login failed: ${JSON.stringify(login.body)}`);
  const setup = await a.post('/api/v1/admin/auth/mfa/setup');
  await a.post('/api/v1/admin/auth/mfa/confirm').send({ code: totp(setup.body.data.secret) });
  return { agent: a, user, secret: setup.body.data.secret };
}

/** Minimal catalogue: one active category with N published products in stock. */
async function seedCatalogue({ products = 2, stock = 10, price = 118000, gstRate = 18, packaging = 5000 } = {}) {
  const category = await models.Category.create({ name: 'Bags & Backpacks', slug: 'bags-backpacks', isActive: true, productCount: products });
  const items = [];
  for (let i = 1; i <= products; i++) {
    const p = await models.Product.create({
      name: `Test Pack ${i}`,
      slug: `test-pack-${i}`,
      sku: `DDG-BAG-00${i}`,
      category: category._id,
      categoryPath: [category._id],
      pricing: { priceInclusive: price, gstRate, gstRule: 'fixed' },
      packagingCharge: packaging,
      weightKg: 1,
      status: 'published',
      stockStatus: stock > 0 ? 'in_stock' : 'out_of_stock',
      availableQty: stock,
      description: 'A test product description that is long enough.',
    });
    const v = await models.ProductVariant.create({ product: p._id, sku: p.sku, title: 'Default', isDefault: true, stock, available: stock, reserved: 0 });
    items.push({ product: p, variant: v });
  }
  const zone = await models.ShippingZone.create({ name: 'All India', countries: ['IN'], isActive: true });
  await models.ShippingRate.create({ zone: zone._id, name: 'Standard', method: 'standard', type: 'flat', flatCharge: 9900, isActive: true });
  return { category, items, zone };
}

/** Fake Razorpay client that records calls and lets tests decide payment state. */
function fakeRazorpay() {
  const state = { orders: new Map(), payments: new Map(), refunds: [] };
  let n = 0;
  const client = {
    orders: {
      create: async ({ amount, receipt }) => {
        const id = `order_TEST${++n}`;
        state.orders.set(id, { id, amount, receipt });
        return { id, amount, currency: 'INR', receipt, status: 'created' };
      },
      fetchPayments: async (orderId) => ({ items: [...state.payments.values()].filter((p) => p.order_id === orderId) }),
    },
    payments: {
      fetch: async (id) => state.payments.get(id),
      refund: async (paymentId, { amount }) => {
        const r = { id: `rfnd_TEST${state.refunds.length + 1}`, payment_id: paymentId, amount, status: 'processed' };
        state.refunds.push(r);
        return r;
      },
    },
  };
  razorpay.setClient(client);
  return {
    state,
    pay(orderId, { status = 'captured', amount } = {}) {
      const id = `pay_TEST${++n}`;
      const order = state.orders.get(orderId);
      const p = { id, order_id: orderId, amount: amount ?? order.amount, status, method: 'upi' };
      state.payments.set(id, p);
      return { razorpay_order_id: orderId, razorpay_payment_id: id, razorpay_signature: hmacSha256(process.env.RAZORPAY_KEY_SECRET, `${orderId}|${id}`) };
    },
    webhookSignature: (raw) => hmacSha256(process.env.RAZORPAY_WEBHOOK_SECRET, raw),
  };
}

const address = { fullName: 'Asha Verma', phone: '9876543210', line1: '12 Test Road', city: 'Greater Noida', state: 'Uttar Pradesh', pincode: '201310' };

module.exports = { setupDb, teardownDb, agent, captureEmails, createAdmin, adminAgent, seedCatalogue, fakeRazorpay, address, models, request, getApp: () => app, fixtures: path.resolve(__dirname, '../data') };
