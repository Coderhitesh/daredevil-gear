'use strict';

const router = require('express').Router();
const { asyncHandler: h } = require('../utils/http');
const { validate } = require('../middleware/validate');
const { requireCustomer, requireVerifiedCustomer } = require('../middleware/auth');
const { limiters } = require('../middleware/security');
const c = require('../controllers/account.controller');
const { z, objectId, email, phone, name, address, safeText } = require('../validators/schemas');

const orderParams = z.object({ orderNumber: z.string().trim().toUpperCase().regex(/^DDG\d{10}$/, 'Invalid order number') });

// profile & security
router.get('/users/me', requireCustomer, h(c.profile));
router.patch(
  '/users/me',
  requireCustomer,
  validate({ body: z.object({ name: name.optional(), phone: phone.optional().or(z.literal('')), notificationPrefs: z.object({ orderUpdates: z.boolean().optional(), marketing: z.boolean().optional(), whatsapp: z.boolean().optional() }).optional() }) }),
  h(c.updateProfile)
);
router.post('/users/me/password', requireCustomer, limiters.auth, validate({ body: z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(10).max(128) }) }), h(c.changePassword));
router.get('/users/me/sessions', requireCustomer, h(c.sessions));
router.delete('/users/me/sessions/:id', requireCustomer, validate({ params: z.object({ id: objectId }) }), h(c.revokeSession));
router.post('/users/me/privacy-requests', requireCustomer, limiters.forms, validate({ body: z.object({ type: z.enum(['export', 'erasure', 'correction', 'withdraw_consent']), note: safeText(1000).optional() }) }), h(c.privacyRequest));
router.get('/users/me/export', requireCustomer, limiters.forms, h(c.exportData));

// addresses
router.get('/addresses', requireCustomer, h(c.addresses));
router.post('/addresses', requireCustomer, validate({ body: address }), h(c.createAddress));
router.patch('/addresses/:id', requireCustomer, validate({ params: z.object({ id: objectId }), body: address.partial() }), h(c.updateAddress));
router.delete('/addresses/:id', requireCustomer, validate({ params: z.object({ id: objectId }) }), h(c.deleteAddress));

// orders (signed-in owner, or guest with x-ddg-order-token)
router.get('/orders', requireCustomer, h(c.orders));
router.post('/orders/track', limiters.forms, validate({ body: z.object({ orderNumber: z.string().trim().max(20), email }) }), h(c.trackOrder));
router.get('/orders/:orderNumber', validate({ params: orderParams }), h(c.order));
router.get('/orders/:orderNumber/invoice', validate({ params: orderParams }), h(c.invoice));
router.post('/orders/:orderNumber/cancel', validate({ params: orderParams, body: z.object({ reason: z.string().trim().min(3).max(300) }) }), h(c.cancel));
router.post(
  '/orders/:orderNumber/returns',
  requireVerifiedCustomer,
  validate({
    params: orderParams,
    body: z.object({
      type: z.enum(['return', 'exchange', 'damaged_or_wrong']).default('return'),
      items: z.array(z.object({ orderItem: objectId, quantity: z.number().int().min(1).max(99) })).min(1).max(50),
      reason: z.string().trim().min(3).max(200),
      description: safeText(2000).optional(),
      photos: z.array(z.object({ url: z.string().url().max(500), publicId: z.string().max(200).optional() })).max(6).optional(),
    }),
  }),
  h(c.createReturn)
);

// reviews
router.get('/users/me/reviews', requireCustomer, h(c.myReviews));
router.post(
  '/reviews',
  requireVerifiedCustomer,
  limiters.forms,
  validate({ body: z.object({ productId: objectId, rating: z.number().int().min(1).max(5), title: safeText(120).optional(), body: z.string().trim().min(10, 'Please write at least 10 characters').max(4000) }) }),
  h(c.createReview)
);
router.post('/reviews/:id/report', requireCustomer, limiters.forms, validate({ params: z.object({ id: objectId }), body: z.object({ reason: z.string().trim().min(3).max(300) }) }), h(c.reportReview));

module.exports = router;
