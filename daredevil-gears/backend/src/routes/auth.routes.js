'use strict';

const router = require('express').Router();
const { asyncHandler: h } = require('../utils/http');
const { validate } = require('../middleware/validate');
const { limiters } = require('../middleware/security');
const { optionalCustomer } = require('../middleware/auth');
const c = require('../controllers/auth.controller');
const { z, email, password, otp, name, phone } = require('../validators/schemas');

router.post(
  '/register',
  limiters.auth,
  validate({
    body: z.object({
      name,
      email,
      password: z.string().min(10, 'Use at least 10 characters').max(128),
      phone: phone.optional().or(z.literal('')),
      marketingConsent: z.boolean().optional(),
    }),
  }),
  h(c.register)
);
router.post('/verify-email', limiters.auth, validate({ body: z.object({ email, code: otp }) }), h(c.verifyEmail));
router.post('/resend-otp', limiters.otp, validate({ body: z.object({ email }) }), h(c.resendOtp));
router.post('/login', limiters.auth, validate({ body: z.object({ email, password }) }), h(c.login));
router.post('/refresh', limiters.auth, h(c.refresh));
router.post('/logout', h(c.logout));
router.post('/logout-all', optionalCustomer, h(c.logoutAll));
router.post('/forgot-password', limiters.otp, validate({ body: z.object({ email }) }), h(c.forgotPassword));
router.post(
  '/reset-password',
  limiters.auth,
  validate({ body: z.object({ email, code: otp, password: z.string().min(10, 'Use at least 10 characters').max(128) }) }),
  h(c.resetPassword)
);
router.get('/me', optionalCustomer, h(c.me));

module.exports = router;
