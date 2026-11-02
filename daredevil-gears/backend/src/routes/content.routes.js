'use strict';

const router = require('express').Router();
const { asyncHandler: h } = require('../utils/http');
const { validate } = require('../middleware/validate');
const { limiters } = require('../middleware/security');
const { requireVerifiedCustomer } = require('../middleware/auth');
const { memoryUpload } = require('../services/upload.service');
const c = require('../controllers/content.controller');
const { z, email, phone, name, slug, safeText } = require('../validators/schemas');

router.get('/storefront/shell', h(c.shell));
router.get('/storefront/home', h(c.home));
router.get('/storefront/sitemap', h(c.sitemap));
router.get('/storefront/redirects', h(c.redirects));
router.get('/storefront/redirect', validate({ query: z.object({ path: z.string().max(500) }) }), h(c.resolveRedirect));
router.get('/pages', h(c.pages));
router.get('/pages/:slug', validate({ params: z.object({ slug }) }), h(c.page));

router.post('/newsletter/subscribe', limiters.forms, validate({ body: z.object({ email, source: z.string().max(40).optional(), consent: z.literal(true, { errorMap: () => ({ message: 'Please confirm you want to receive emails' }) }) }) }), h(c.subscribe));
router.get('/newsletter/unsubscribe', validate({ query: z.object({ token: z.string().min(10).max(100) }) }), h(c.unsubscribe));

router.post(
  '/contact',
  limiters.forms,
  validate({
    body: z.object({
      name,
      email,
      phone: phone.optional().or(z.literal('')),
      subject: safeText(150).optional(),
      message: z.string().trim().min(10, 'Please write a little more').max(5000),
      bulk: z.object({ organisation: safeText(150).optional(), quantity: safeText(100).optional(), deliveryLocation: safeText(200).optional(), products: safeText(1000).optional(), isGovernment: z.boolean().optional() }).optional(),
      website: z.string().max(0, 'Spam detected').optional(), // honeypot
    }),
  }),
  h(c.contact)
);

router.post(
  '/grievances',
  limiters.forms,
  validate({
    body: z.object({
      name,
      email,
      phone: phone.optional().or(z.literal('')),
      orderNumber: z.string().trim().max(20).optional(),
      category: z.enum(['order', 'payment', 'product', 'delivery', 'refund', 'privacy', 'other']).default('other'),
      subject: z.string().trim().min(3).max(200),
      description: z.string().trim().min(20, 'Please describe the issue (at least 20 characters)').max(5000),
    }),
  }),
  h(c.createGrievance)
);
router.post('/grievances/status', limiters.forms, validate({ body: z.object({ ticketNumber: z.string().trim().max(20), email }) }), h(c.grievanceStatus));

router.post('/uploads/return-photo', requireVerifiedCustomer, limiters.forms, memoryUpload({ maxMb: 6, maxFiles: 1 }).single('file'), h(c.uploadReturnPhoto));

module.exports = router;
