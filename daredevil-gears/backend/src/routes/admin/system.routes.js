'use strict';

const router = require('express').Router();
const env = require('../../config/env');
const { asyncHandler: h, ok, ApiError, parsePagination, pageMeta } = require('../../utils/http');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/auth');
const { audit } = require('../../services/audit.service');
const { User, Session, AuditLog, EmailLog, ShippingZone, ShippingRate, SiteSetting } = require('../../models');
const settings = require('../../services/settings.service');
const tax = require('../../services/tax.service');
const reports = require('../../services/report.service');
const search = require('../../services/search.service');
const { hashPassword, passwordProblem } = require('../../services/password.service');
const { randomToken } = require('../../utils/crypto');
const { crud } = require('./crud');
const { z, objectId, email, name, paise, safeText } = require('../../validators/schemas');
const { ADMIN_ROLES } = require('../../shared');

const idParams = z.object({ id: objectId });

// ---------------- dashboard & reports ----------------
router.get('/dashboard', requirePermission('dashboard:read'), h(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
  return ok(res, await reports.dashboard({ days, from: req.query.from, to: req.query.to }));
}));

router.get('/reports/sales.csv', requirePermission('reports:read'), h(async (req, res) => {
  const rows = await reports.salesRows({ from: req.query.from, to: req.query.to, days: 30 });
  await audit(req, { action: 'report.sales_export', entity: 'Order', summary: `${rows.length} rows` });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="ddg-sales-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(reports.toCsv(rows) || 'No paid orders in this period');
}));

router.get('/reports/search', requirePermission('reports:read'), h(async (req, res) => ok(res, await search.analytics({ days: Math.min(180, parseInt(req.query.days, 10) || 30) }))));

router.get('/system/status', requirePermission('settings:read'), h(async (_req, res) => {
  const pending = await SiteSetting.find({ requiresReview: true }).select('key reviewNote').lean();
  return ok(res, {
    environment: env.NODE_ENV,
    integrations: {
      smtp: env.smtpConfigured,
      razorpay: env.razorpayConfigured ? env.razorpayMode : false,
      razorpayWebhook: Boolean(env.RAZORPAY_WEBHOOK_SECRET),
      cloudinary: env.cloudinaryConfigured,
      redis: Boolean(env.REDIS_URL),
      shippingProvider: env.SHIPPING_PROVIDER,
      sentry: Boolean(env.SENTRY_DSN),
    },
    mfaRequired: env.ADMIN_MFA_REQUIRED,
    pendingReview: pending,
    taxReviewed: (await tax.get()).reviewedByAccountant,
  });
}));

// ---------------- settings ----------------
const settingSchemas = {
  business: z.object({ displayName: safeText(80), legalName: safeText(200).optional(), cin: z.string().trim().regex(/^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/, 'Invalid CIN').optional().or(z.literal('')), gstin: z.string().trim().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Invalid GSTIN').optional().or(z.literal('')), gstinVerified: z.boolean().optional(), registeredAddress: safeText(400).optional(), addressShort: safeText(200).optional(), mapEmbedUrl: z.string().url().regex(/^https:\/\/(www\.)?google\.com\/maps\/embed/, 'Use a Google Maps embed URL').optional().or(z.literal('')), email, phone: safeText(30), whatsapp: z.string().regex(/^\+?\d{10,15}$/).optional().or(z.literal('')), hours: safeText(80).optional(), jurisdiction: safeText(200).optional(), tagline: safeText(120).optional() }),
  grievanceOfficer: z.object({ name: safeText(120).optional(), designation: safeText(120).optional(), phone: safeText(30).optional(), email: email.optional().or(z.literal('')), acknowledgeHours: z.number().int().min(1).max(48).default(48), resolveDays: z.number().int().min(1).max(30).default(30) }),
  announcement: z.object({ isActive: z.boolean(), text: safeText(200).optional(), href: z.string().max(300).optional().or(z.literal('')) }),
  checkout: z.object({ guestCheckout: z.boolean(), packagingMode: z.enum(['included', 'per_unit', 'per_line', 'per_order_max']), codEnabled: z.boolean(), codFee: paise, codAddCourierCharge: z.boolean(), codMinOrderValue: paise, codMaxOrderValue: paise, codGuestAllowed: z.boolean(), codMaxOpenOrders: z.number().int().min(1).max(50), ageConfirmationText: safeText(300), orderNotesEnabled: z.boolean().optional() }),
  shipping: z.object({ freeShippingEnabled: z.boolean(), freeShippingThreshold: paise, internationalMode: z.enum(['quote_only', 'enabled']), defaultItemWeightKg: z.number().min(0.05).max(50) }),
  shiprocket: z.object({
    ratesEnabled: z.boolean(),
    courierChoice: z.enum(['cheapest', 'recommended', 'cheapest_and_fastest']),
    showCourierName: z.boolean(),
    addGstToRate: z.boolean(),
    handlingCharge: paise,
    fallbackToManualRates: z.boolean(),
    autoPush: z.boolean(),
    autoAssignCourier: z.boolean(),
    pickupLocation: z.string().trim().min(1).max(80),
    pickupPincode: z.string().trim().regex(/^([1-9]\d{5})?$/, 'Enter the 6-digit PIN code of your pickup address'),
    channelId: z.string().trim().regex(/^\d*$/, 'Numbers only').max(20).optional().or(z.literal('')),
    lengthCm: z.number().min(0.5).max(300),
    breadthCm: z.number().min(0.5).max(300),
    heightCm: z.number().min(0.5).max(300),
  }),
  seo: z.object({ homeTitle: safeText(70), homeDescription: safeText(170), ogImage: z.string().url().optional().or(z.literal('')) }),
  analytics: z.object({ ga4Id: z.string().regex(/^G-[A-Z0-9]{4,12}$/, 'GA4 IDs look like G-XXXXXXX').optional().or(z.literal('')), gscVerification: safeText(100).optional() }),
  social: z.object({ instagram: z.string().url().optional().or(z.literal('')), facebook: z.string().url().optional().or(z.literal('')), youtube: z.string().url().optional().or(z.literal('')), linkedin: z.string().url().optional().or(z.literal('')), googleBusiness: z.string().url().optional().or(z.literal('')) }),
  notifications: z.object({ adminEmails: z.array(email).max(10), notifyOnNewOrder: z.boolean(), notifyOnReturn: z.boolean(), notifyOnGrievance: z.boolean(), notifyOnLowStock: z.boolean(), fromName: safeText(80).optional() }),
  reviews: z.object({ enabled: z.boolean(), requireVerifiedPurchase: z.boolean(), autoApprove: z.boolean() }),
};

router.get('/settings', requirePermission('settings:read'), h(async (_req, res) => {
  const docs = await SiteSetting.find().lean();
  const meta = new Map(docs.map((d) => [d.key, d]));
  const out = {};
  for (const key of Object.keys(settings.DEFAULTS)) out[key] = { value: await settings.get(key), requiresReview: meta.get(key)?.requiresReview ?? Boolean(settings.DEFAULTS[key].requiresReview), reviewNote: meta.get(key)?.reviewNote || settings.DEFAULTS[key].reviewNote || null, updatedAt: meta.get(key)?.updatedAt };
  return ok(res, out);
}));

router.put(
  '/settings/:key',
  requirePermission('settings:write'),
  validate({ params: z.object({ key: z.enum(Object.keys(settingSchemas)) }), body: z.object({ value: z.any(), markReviewed: z.boolean().optional() }) }),
  h(async (req, res) => {
    const parsed = settingSchemas[req.params.key].safeParse(req.body.value);
    if (!parsed.success) throw ApiError.unprocessable('Please check the highlighted fields', { details: parsed.error.issues.map((i) => ({ field: `value.${i.path.join('.')}`, message: i.message })) });
    const before = await settings.get(req.params.key);
    await settings.set(req.params.key, parsed.data, { updatedBy: req.admin._id, requiresReview: req.body.markReviewed ? false : undefined });
    await audit(req, { action: 'settings.update', entity: 'SiteSetting', entityId: req.params.key, before, after: parsed.data });
    return ok(res, await settings.get(req.params.key));
  })
);

// ---------------- Shiprocket connection test ----------------
router.post(
  '/settings/shiprocket/test',
  requirePermission('settings:read'),
  validate({ body: z.object({ pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a 6-digit PIN code'), weightKg: z.number().min(0.1).max(100).default(1) }) }),
  h(async (req, res) => {
    const sr = require('../../services/shipping-provider.service');
    if (!sr.enabled()) throw ApiError.unavailable('Shiprocket is not configured. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in backend/.env and restart the API.', { code: 'PROVIDER_NOT_CONFIGURED' });
    const cfg = await settings.get('shiprocket');
    const locations = await sr.pickupLocations().catch((err) => ({ error: err.message }));
    if (!cfg.pickupPincode) return ok(res, { ok: false, locations, message: 'Login worked. Now enter the pickup PIN code below and save.' });
    const shipping = require('../../services/shipping.service');
    const rates = await shipping.shiprocketQuote({ pincode: req.body.pincode, weightKg: req.body.weightKg, declaredValue: 0, netItemsTotal: 0, cfg, ignoreFree: true });
    return ok(res, { ok: true, locations, pickupPincode: cfg.pickupPincode, couriers: rates.all, options: rates.options });
  })
);

// ---------------- tax ----------------
router.get('/tax', requirePermission('settings:read'), h(async (_req, res) => ok(res, await tax.get())));
router.put(
  '/tax',
  requirePermission('tax:write'),
  validate({ body: z.object({ sellerState: safeText(80), sellerStateCode: z.string().regex(/^\d{2}$/), apparelRule: z.object({ thresholdPerPiece: paise, lowRate: z.number(), highRate: z.number() }), shippingTaxRate: z.number().refine((v) => [0, 5, 12, 18].includes(v)), packagingTaxMode: z.enum(['item_rate', 'fixed']), packagingFixedRate: z.number().refine((v) => [0, 5, 12, 18].includes(v)), reviewedByAccountant: z.boolean(), reviewNote: safeText(1000).optional() }) }),
  h(async (req, res) => {
    const before = await tax.get();
    const data = { ...req.body, ...(req.body.reviewedByAccountant && !before.reviewedByAccountant ? { reviewedAt: new Date() } : {}) };
    const doc = await tax.update(data, req.admin._id);
    await audit(req, { action: 'tax.update', entity: 'TaxConfiguration', entityId: doc._id, before, after: data });
    return ok(res, doc);
  })
);

// ---------------- shipping ----------------
router.use(
  '/shipping/zones',
  crud({
    Model: ShippingZone,
    schema: z.object({ name: z.string().trim().min(2).max(80), scope: z.enum(['domestic', 'international']).default('domestic'), countries: z.array(z.string().length(2)).default(['IN']), states: z.array(z.string().max(80)).default([]), pincodePrefixes: z.array(z.string().regex(/^\d{1,6}$/)).max(2000).default([]), excludedPincodes: z.array(z.string().regex(/^\d{6}$/)).max(5000).default([]), isActive: z.boolean().optional(), sortOrder: z.number().int().optional() }),
    entity: 'ShippingZone',
    read: 'settings:read',
    write: 'shipping:write',
    sort: { sortOrder: 1 },
    canDelete: async (doc) => ((await ShippingRate.exists({ zone: doc._id })) ? 'Delete the rates in this zone first' : null),
  })
);
router.use(
  '/shipping/rates',
  crud({
    Model: ShippingRate,
    schema: z.object({ zone: objectId, name: z.string().trim().min(2).max(80), method: z.enum(['standard', 'express', 'india_post']).default('standard'), type: z.enum(['flat', 'weight_slab']).default('flat'), flatCharge: paise.default(0), slabs: z.array(z.object({ maxKg: z.number().positive(), charge: paise })).max(20).default([]), beyondPerKg: paise.default(0), freeAbove: paise.nullable().optional(), minOrderValue: paise.nullable().optional(), estimatedDays: z.object({ min: z.number().int().min(0).max(60).optional(), max: z.number().int().min(0).max(90).optional() }).optional(), isActive: z.boolean().optional(), sortOrder: z.number().int().optional(), requiresReview: z.boolean().optional(), reviewNote: safeText(500).optional() }),
    entity: 'ShippingRate',
    read: 'settings:read',
    write: 'shipping:write',
    populate: 'zone',
    sort: { sortOrder: 1 },
    filters: { zone: 'zone' },
  })
);

// ---------------- audit & email logs ----------------
router.get('/audit-logs', requirePermission('audit:read'), h(async (req, res) => {
  const pg = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
  const filter = {};
  if (req.query.action) filter.action = { $regex: `^${String(req.query.action).replace(/[^a-z_.]/gi, '')}` };
  if (req.query.entity) filter.entity = String(req.query.entity);
  if (req.query.actor && /^[a-f\d]{24}$/i.test(req.query.actor)) filter.actor = req.query.actor;
  const [items, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(), AuditLog.countDocuments(filter)]);
  return ok(res, items, pageMeta(pg, total));
}));

router.get('/email-logs', requirePermission('orders:read'), h(async (req, res) => {
  const pg = parsePagination(req.query, { defaultLimit: 50 });
  const filter = req.query.status ? { status: String(req.query.status) } : {};
  const [items, total] = await Promise.all([EmailLog.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(), EmailLog.countDocuments(filter)]);
  return ok(res, items, pageMeta(pg, total));
}));

// ---------------- admin users (super admin only) ----------------
router.get('/admins', requirePermission('admins:manage'), h(async (_req, res) => {
  const admins = await User.find({ role: { $in: ADMIN_ROLES } }).sort({ createdAt: 1 }).lean();
  return ok(res, admins.map((u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, status: u.status, mfaEnabled: Boolean(u.mfa?.enabled), lastLoginAt: u.lastLoginAt, createdAt: u.createdAt })));
}));

router.post(
  '/admins',
  requirePermission('admins:manage'),
  validate({ body: z.object({ name, email, role: z.enum(ADMIN_ROLES.filter((r) => r !== 'super_admin')) }) }),
  h(async (req, res) => {
    if (await User.exists({ email: req.body.email })) throw ApiError.conflict('An account with this email already exists');
    const tempPassword = `${randomToken(9)}9a`;
    const user = await User.create({ ...req.body, status: 'active', emailVerified: true, emailVerifiedAt: new Date(), passwordHash: await hashPassword(tempPassword) });
    await audit(req, { action: 'admin.create', entity: 'User', entityId: user._id, summary: `${user.email} (${user.role})` });
    // shown once to the super admin to hand over securely; the new admin must change it and enrol MFA
    return ok(res, { id: String(user._id), email: user.email, role: user.role, temporaryPassword: tempPassword }, undefined, 201);
  })
);

router.patch(
  '/admins/:id',
  requirePermission('admins:manage'),
  validate({ params: idParams, body: z.object({ role: z.enum(ADMIN_ROLES).optional(), status: z.enum(['active', 'suspended']).optional(), resetMfa: z.boolean().optional(), resetPassword: z.boolean().optional() }) }),
  h(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, role: { $in: ADMIN_ROLES } }).select('+mfa.secret');
    if (!user) throw ApiError.notFound();
    if (String(user._id) === String(req.admin._id) && (req.body.status === 'suspended' || (req.body.role && req.body.role !== 'super_admin'))) throw ApiError.badRequest('You cannot demote or suspend yourself');
    if (user.role === 'super_admin' && (req.body.role && req.body.role !== 'super_admin')) {
      const supers = await User.countDocuments({ role: 'super_admin', status: 'active' });
      if (supers <= 1) throw ApiError.badRequest('At least one active super admin is required');
    }
    const out = {};
    if (req.body.role) user.role = req.body.role;
    if (req.body.status) user.status = req.body.status;
    if (req.body.resetMfa) user.mfa = { enabled: false };
    if (req.body.resetPassword) {
      out.temporaryPassword = `${randomToken(9)}9a`;
      if (passwordProblem(out.temporaryPassword)) out.temporaryPassword += 'x7';
      user.passwordHash = await hashPassword(out.temporaryPassword);
    }
    await user.save();
    if (req.body.status === 'suspended' || req.body.resetPassword || req.body.resetMfa || req.body.role) {
      await Session.updateMany({ user: user._id, kind: 'admin', revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'admin_changed' } });
    }
    await audit(req, { action: 'admin.update', entity: 'User', entityId: user._id, summary: JSON.stringify({ ...req.body }) });
    return ok(res, { id: String(user._id), role: user.role, status: user.status, mfaEnabled: Boolean(user.mfa?.enabled), ...out });
  })
);

module.exports = router;
