'use strict';

const router = require('express').Router();
const { asyncHandler: h, ok, ApiError, parsePagination, pageMeta } = require('../../utils/http');
const { validate } = require('../../middleware/validate');
const { requirePermission } = require('../../middleware/auth');
const { audit } = require('../../services/audit.service');
const { Banner, HomeSection, CMSPage, NavigationMenu, NewsletterSubscriber, EmailTemplate, SeoRedirect, GrievanceComplaint, ContactMessage } = require('../../models');
const { TEMPLATES, render } = require('../../emails/templates');
const email = require('../../services/email.service');
const settings = require('../../services/settings.service');
const { sanitizeRich } = require('../../utils/text');
const { toCsv } = require('../../services/report.service');
const { crud } = require('./crud');
const { z, objectId, slug, safeText } = require('../../validators/schemas');

const idParams = z.object({ id: objectId });
const href = z.string().trim().max(500).regex(/^(\/[^\s]*|https?:\/\/[^\s]+|mailto:[^\s]+|tel:[^\s]+)$/, 'Use a path like /category/bags or a full https:// URL').optional().or(z.literal(''));

// ---------------- banners ----------------
router.use(
  '/banners',
  crud({
    Model: Banner,
    schema: z.object({
      title: z.string().trim().min(2).max(140),
      eyebrow: safeText(60).optional(),
      subtitle: safeText(300).optional(),
      ctaLabel: safeText(40).optional(),
      ctaHref: href,
      secondaryCtaLabel: safeText(40).optional(),
      secondaryCtaHref: href,
      linkHref: href,
      openInNewTab: z.boolean().optional(),
      layout: z.enum(['overlay', 'image_only']).default('overlay'),
      durationSeconds: z.number().int().min(3).max(30).optional(),
      image: z.object({ desktop: z.string().url().optional().or(z.literal('')), mobile: z.string().url().optional().or(z.literal('')), alt: safeText(160).optional(), publicId: z.string().optional() }).optional(),
      placement: z.enum(['hero', 'promo', 'category']).default('hero'),
      theme: z.enum(['dark', 'light']).default('dark'),
      sortOrder: z.number().int().optional(),
      isActive: z.boolean().optional(),
      startsAt: z.coerce.date().nullable().optional(),
      endsAt: z.coerce.date().nullable().optional(),
    }),
    entity: 'Banner',
    read: 'content:write',
    write: 'content:write',
    searchFields: ['title'],
    filters: { placement: 'placement' },
    sort: { placement: 1, sortOrder: 1 },
  })
);

// ---------------- homepage sections ----------------
router.get('/home-sections', requirePermission('content:write'), h(async (_req, res) => ok(res, await HomeSection.find().sort({ sortOrder: 1 }).lean())));

router.patch(
  '/home-sections/:id',
  requirePermission('content:write'),
  validate({
    params: idParams,
    body: z.object({
      title: safeText(140).optional(),
      subtitle: safeText(300).optional(),
      isVisible: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
      config: z
        .object({
          source: z.enum(['bestsellers', 'new', 'featured', 'manual', 'collection', 'category']).optional(),
          products: z.array(objectId).max(24).optional(),
          collection: objectId.nullable().optional(),
          category: objectId.nullable().optional(),
          categories: z.array(objectId).max(12).optional(),
          limit: z.number().int().min(1).max(24).optional(),
          body: safeText(3000).optional(),
          image: z.string().url().optional().or(z.literal('')),
          imageAlt: safeText(160).optional(),
          ctaLabel: safeText(40).optional(),
          ctaHref: href,
          items: z.array(z.object({ title: safeText(80), text: safeText(300).optional(), icon: z.string().max(40).optional() })).max(8).optional(),
        })
        .optional(),
    }),
  }),
  h(async (req, res) => {
    const s = await HomeSection.findById(req.params.id);
    if (!s) throw ApiError.notFound();
    const before = s.toObject();
    if (req.body.config) s.config = { ...(s.config?.toObject?.() || {}), ...req.body.config };
    for (const k of ['title', 'subtitle', 'isVisible', 'sortOrder']) if (req.body[k] !== undefined) s[k] = req.body[k];
    await s.save();
    await audit(req, { action: 'home_section.update', entity: 'HomeSection', entityId: s._id, before, after: s.toObject() });
    return ok(res, s);
  })
);

router.post(
  '/home-sections/reorder',
  requirePermission('content:write'),
  validate({ body: z.object({ ids: z.array(objectId).max(30) }) }),
  h(async (req, res) => {
    await Promise.all(req.body.ids.map((id, i) => HomeSection.updateOne({ _id: id }, { $set: { sortOrder: (i + 1) * 10 } })));
    await audit(req, { action: 'home_section.reorder', entity: 'HomeSection' });
    return ok(res, await HomeSection.find().sort({ sortOrder: 1 }).lean());
  })
);

// ---------------- CMS pages ----------------
router.use(
  '/pages',
  crud({
    Model: CMSPage,
    schema: z.object({
      slug,
      title: z.string().trim().min(2).max(140),
      body: z.string().max(100000).default(''),
      excerpt: safeText(300).optional(),
      group: z.enum(['policy', 'company', 'help']).default('help'),
      seo: z.object({ title: safeText(70).optional(), description: safeText(170).optional() }).optional(),
      isPublished: z.boolean().optional(),
      requiresReview: z.boolean().optional(),
      reviewNotes: safeText(1000).optional(),
      sortOrder: z.number().int().optional(),
    }),
    entity: 'CMSPage',
    read: 'content:write',
    write: 'content:write',
    searchFields: ['title', 'slug'],
    sort: { group: 1, sortOrder: 1 },
    beforeSave: async (data, req, doc) => {
      const out = { ...data, updatedBy: req.admin._id };
      if (out.body !== undefined) out.body = sanitizeRich(out.body);
      if (doc) out.version = (doc.version || 1) + 1;
      if (out.slug) {
        const clash = await CMSPage.findOne({ slug: out.slug, ...(doc ? { _id: { $ne: doc._id } } : {}) }).lean();
        if (clash) throw ApiError.conflict('Another page already uses this URL');
      }
      return out;
    },
  })
);

// ---------------- navigation ----------------
const navItem = z.object({ label: z.string().trim().min(1).max(60), href, children: z.array(z.object({ label: z.string().trim().min(1).max(60), href })).max(20).optional() });
router.get('/navigation', requirePermission('content:write'), h(async (_req, res) => ok(res, await NavigationMenu.find().lean())));
router.put(
  '/navigation/:key',
  requirePermission('content:write'),
  validate({ params: z.object({ key: z.enum(['header', 'footer_shop', 'footer_help', 'footer_company', 'footer_legal']) }), body: z.object({ title: safeText(60).optional(), items: z.array(navItem).max(20) }) }),
  h(async (req, res) => {
    const menu = await NavigationMenu.findOneAndUpdate({ key: req.params.key }, { $set: { items: req.body.items, title: req.body.title } }, { upsert: true, new: true });
    await audit(req, { action: 'navigation.update', entity: 'NavigationMenu', entityId: menu._id, summary: req.params.key });
    return ok(res, menu);
  })
);

// ---------------- newsletter ----------------
router.get('/newsletter', requirePermission('content:write'), h(async (req, res) => {
  const pg = parsePagination(req.query, { defaultLimit: 100, maxLimit: 500 });
  const filter = req.query.status ? { status: String(req.query.status) } : {};
  const [items, total] = await Promise.all([NewsletterSubscriber.find(filter).select('-unsubscribeTokenHash -ip').sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(), NewsletterSubscriber.countDocuments(filter)]);
  return ok(res, items, pageMeta(pg, total));
}));
router.get('/newsletter/export', requirePermission('customers:export'), h(async (req, res) => {
  const list = await NewsletterSubscriber.find({ status: 'subscribed' }).select('email source consentAt').lean();
  await audit(req, { action: 'newsletter.export', entity: 'NewsletterSubscriber', summary: `${list.length} rows` });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="newsletter-subscribers.csv"');
  return res.send(toCsv(list.map((s) => ({ email: s.email, source: s.source || '', consentAt: s.consentAt?.toISOString() || '' }))));
}));

// ---------------- email templates ----------------
router.get('/email-templates', requirePermission('settings:read'), h(async (_req, res) => {
  const overrides = await EmailTemplate.find().lean();
  const map = new Map(overrides.map((o) => [o.key, o]));
  return ok(res, Object.entries(TEMPLATES).map(([key, t]) => ({ key, label: t.label, critical: Boolean(t.critical), override: map.get(key) || null })));
}));
router.put(
  '/email-templates/:key',
  requirePermission('settings:write'),
  validate({ params: z.object({ key: z.enum(Object.keys(TEMPLATES)) }), body: z.object({ subject: safeText(200).optional(), heading: safeText(200).optional(), intro: safeText(1000).optional(), footerNote: safeText(500).optional(), isActive: z.boolean().optional() }) }),
  h(async (req, res) => {
    const doc = await EmailTemplate.findOneAndUpdate({ key: req.params.key }, { $set: { ...req.body, updatedBy: req.admin._id } }, { upsert: true, new: true });
    await audit(req, { action: 'email_template.update', entity: 'EmailTemplate', entityId: doc._id, summary: req.params.key });
    return ok(res, doc);
  })
);
router.get('/email-templates/:key/preview', requirePermission('settings:read'), validate({ params: z.object({ key: z.enum(Object.keys(TEMPLATES)) }) }), h(async (req, res) => {
  const sample = sampleData();
  const override = await EmailTemplate.findOne({ key: req.params.key }).lean();
  const msg = render(req.params.key, sample, { override, business: await settings.get('business') });
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:");
  return res.send(msg.html);
}));
router.post('/email-templates/:key/test', requirePermission('settings:write'), validate({ params: z.object({ key: z.enum(Object.keys(TEMPLATES)) }) }), h(async (req, res) => {
  await email.deliver({ to: req.admin.email, templateKey: req.params.key, data: sampleData() });
  return ok(res, { sentTo: req.admin.email });
}));

function sampleData() {
  const order = {
    orderNumber: 'DDG2610270001',
    items: [{ name: 'Sample item', sku: 'DDG-BAG-001', quantity: 1, netTotal: 353882, variantTitle: 'Default' }],
    pricing: { itemsTotal: 353882, discount: 0, packagingCharge: 5000, shippingCharge: 0, grandTotal: 358882, taxTotal: 54744 },
    shippingAddress: { fullName: 'Sample Customer', line1: '12 Sample Street', city: 'Greater Noida', state: 'Uttar Pradesh', pincode: '201310', phone: '9999999999' },
  };
  return { code: '000000', minutes: 10, name: 'Sample Customer', storeUrl: 'https://www.daredevilgears.com', order, orderUrl: '#', retryUrl: '#', shipment: { carrier: 'Sample Carrier', trackingNumber: 'AWB123456' }, status: 'shipped', reason: 'Sample reason', refundAmount: 358882, request: { requestNumber: 'RET000001', status: 'approved' }, refund: { amount: 358882, status: 'processed' }, ticket: { ticketNumber: 'GRV202600001' }, title: 'Sample alert', lines: ['Line one', 'Line two'], url: '#' };
}

// ---------------- SEO redirects ----------------
router.use(
  '/redirects',
  crud({
    Model: SeoRedirect,
    schema: z.object({ from: z.string().trim().regex(/^\/[^\s?#]*$/, 'Use a path starting with /').max(500), to: z.string().trim().regex(/^(\/[^\s]*|https:\/\/[^\s]+)$/).max(500), statusCode: z.union([z.literal(301), z.literal(302), z.literal(410)]).default(301), isActive: z.boolean().optional(), note: safeText(300).optional() }),
    entity: 'SeoRedirect',
    read: 'content:write',
    write: 'content:write',
    searchFields: ['from', 'to'],
    sort: { from: 1 },
    beforeSave: async (data) => {
      if (data.from && data.to && data.from === data.to) throw ApiError.badRequest('A redirect cannot point to itself');
      if (data.to) {
        const loop = await SeoRedirect.findOne({ from: data.to, to: data.from }).lean();
        if (loop) throw ApiError.badRequest('This would create a redirect loop');
      }
      return data;
    },
  })
);

// ---------------- grievances ----------------
router.get('/grievances', requirePermission('grievances:read'), h(async (req, res) => {
  const pg = parsePagination(req.query, { defaultLimit: 50 });
  const filter = req.query.status ? { status: String(req.query.status) } : {};
  const [items, total] = await Promise.all([GrievanceComplaint.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate('assignedTo', 'name').lean(), GrievanceComplaint.countDocuments(filter)]);
  const now = Date.now();
  return ok(res, items.map((g) => ({ ...g, ackOverdue: !g.acknowledgedAt && g.dueAcknowledgeBy && new Date(g.dueAcknowledgeBy).getTime() < now, resolveOverdue: !['resolved', 'closed'].includes(g.status) && g.dueResolveBy && new Date(g.dueResolveBy).getTime() < now })), pageMeta(pg, total));
}));
router.patch(
  '/grievances/:id',
  requirePermission('grievances:write'),
  validate({ params: idParams, body: z.object({ status: z.enum(['acknowledged', 'in_progress', 'resolved', 'closed']).optional(), note: safeText(1000).optional(), resolution: safeText(3000).optional(), assignedTo: objectId.optional() }) }),
  h(async (req, res) => {
    const g = await GrievanceComplaint.findById(req.params.id);
    if (!g) throw ApiError.notFound();
    if (req.body.status) {
      g.status = req.body.status;
      if (['acknowledged', 'in_progress', 'resolved', 'closed'].includes(req.body.status) && !g.acknowledgedAt) g.acknowledgedAt = new Date();
      if (req.body.status === 'resolved') g.resolvedAt = new Date();
    }
    if (req.body.resolution) g.resolution = req.body.resolution;
    if (req.body.assignedTo) g.assignedTo = req.body.assignedTo;
    g.history.push({ status: g.status, note: req.body.note, by: req.admin._id });
    await g.save();
    await audit(req, { action: 'grievance.update', entity: 'GrievanceComplaint', entityId: g._id, summary: `${g.ticketNumber} → ${g.status}` });
    return ok(res, g);
  })
);

// ---------------- contact / bulk messages ----------------
router.get('/messages', requirePermission('grievances:read'), h(async (req, res) => {
  const pg = parsePagination(req.query, { defaultLimit: 50 });
  const filter = {};
  if (req.query.type) filter.type = String(req.query.type);
  if (req.query.status) filter.status = String(req.query.status);
  const [items, total] = await Promise.all([ContactMessage.find(filter).select('-ip').sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(), ContactMessage.countDocuments(filter)]);
  return ok(res, items, pageMeta(pg, total));
}));
router.patch('/messages/:id', requirePermission('grievances:write'), validate({ params: idParams, body: z.object({ status: z.enum(['new', 'in_progress', 'closed']) }) }), h(async (req, res) => {
  const m = await ContactMessage.findByIdAndUpdate(req.params.id, { $set: { status: req.body.status } }, { new: true });
  if (!m) throw ApiError.notFound();
  return ok(res, m);
}));

module.exports = router;
