'use strict';

const router = require('express').Router();
const env = require('../../config/env');
const { requireAdmin } = require('../../middleware/auth');
const { ApiError } = require('../../utils/http');

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store'); // admin responses are never cached
  next();
});

router.use('/auth', require('./auth.routes'));

// everything below requires an admin session
router.use(requireAdmin);

// MFA gate: until an authenticator is enrolled (when required), only /auth/* is reachable
router.use((req, _res, next) => {
  if (env.ADMIN_MFA_REQUIRED && !req.adminSession.mfaSatisfied) return next(ApiError.forbidden('Set up two-factor authentication to continue', { code: 'MFA_SETUP_REQUIRED' }));
  return next();
});

// refresh the storefront cache after changes customers can see
router.use(require('../../services/storefront-cache.service').afterAdminChange);
router.use(require('./system.routes'));
router.use(require('./catalog.routes'));
router.use(require('./sales.routes'));
router.use(require('./content.routes'));
router.use(require('./offers.routes'));
router.use(require('./shipping-data.routes'));

module.exports = router;
