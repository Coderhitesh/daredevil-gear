'use strict';

const router = require('express').Router();
const { asyncHandler: h } = require('../utils/http');
const { validate } = require('../middleware/validate');
const { limiters } = require('../middleware/security');
const c = require('../controllers/checkout.controller');
const { z, objectId, email, phone, pincode, name, address, safeText } = require('../validators/schemas');
// manual rate (Mongo id) or Shiprocket courier option (sr_<courier id>)
const rateId = z.union([objectId, z.string().regex(/^sr_\d{1,9}$/, 'Invalid delivery option')]);

router.get('/checkout/config', h(c.config));

router.post(
  '/checkout/quote',
  validate({ body: z.object({ addressId: objectId.optional(), pincode: pincode.optional(), state: z.string().max(80).optional(), country: z.string().length(2).optional(), rateId: rateId.optional(), email: email.optional(), paymentMethod: z.enum(['online', 'cod']).optional() }) }),
  h(c.quote)
);

router.post(
  '/checkout/place',
  limiters.checkout,
  validate({
    body: z
      .object({
        idempotencyKey: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
        contact: z.object({ name: name.optional(), email: email.optional(), phone: phone.optional() }).default({}),
        addressId: objectId.optional(),
        shippingAddress: address.optional(),
        billingSameAsShipping: z.boolean().default(true),
        billingAddress: address.optional(),
        rateId: rateId.optional(),
        paymentMethod: z.enum(['online', 'cod']).default('online'),
        ageConfirmed: z.boolean().optional(),
        saveAddress: z.boolean().optional(),
        expectedTotal: z.number().int().min(0).optional(),
        notes: safeText(500).optional(),
      })
      .refine((v) => v.addressId || v.shippingAddress, { message: 'Shipping address is required', path: ['shippingAddress'] }),
  }),
  h(c.place)
);

router.post('/checkout/orders/:orderNumber/pay', limiters.checkout, validate({ params: z.object({ orderNumber: z.string().regex(/^DDG\d{10}$/) }) }), h(c.resume));

router.post(
  '/payments/razorpay/verify',
  limiters.checkout,
  validate({ body: z.object({ razorpay_order_id: z.string().max(64), razorpay_payment_id: z.string().max(64), razorpay_signature: z.string().max(256) }) }),
  h(c.verify)
);
router.post(
  '/payments/razorpay/failure',
  validate({ body: z.object({ razorpay_order_id: z.string().max(64), code: z.string().max(64).optional(), description: z.string().max(500).optional(), reason: z.string().max(100).optional() }) }),
  h(c.failure)
);

module.exports = router;
