'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const { ApiError } = require('../utils/http');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests:
 *  1. Unsafe methods must carry the custom header `x-ddg-csrf: 1`. Browsers cannot send custom headers
 *     cross-origin without a CORS preflight, and CORS only allows our own origins.
 *  2. If an Origin header is present it must be an allowed origin.
 * Webhooks are mounted before this middleware and verified by signature instead.
 */
function csrfGuard(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !env.corsOrigins.includes(origin)) return next(ApiError.forbidden('Origin not allowed', { code: 'BAD_ORIGIN' }));
  if (req.headers['x-ddg-csrf'] !== '1') return next(ApiError.forbidden('Missing CSRF header', { code: 'CSRF' }));
  return next();
}

/** Strip keys starting with `$` or containing `.` from user input (NoSQL operator injection). */
function sanitizeInput(req, _res, next) {
  const scrub = (obj, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 12) return obj;
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
      } else if (typeof obj[key] === 'object') {
        scrub(obj[key], depth + 1);
      }
    }
    return obj;
  };
  if (req.body) scrub(req.body);
  if (req.params) scrub(req.params);
  // req.query is a getter in some Express versions; sanitize in place
  if (req.query) scrub(req.query);
  return next();
}

const limiterHandler = (_req, _res, next) => next(ApiError.tooMany());
const skip = () => env.isTest;

const limiters = {
  global: rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false, handler: limiterHandler, skip }),
  auth: rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, handler: limiterHandler, skip }),
  otp: rateLimit({ windowMs: 60 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, handler: limiterHandler, skip }),
  adminLogin: rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, handler: limiterHandler, skip }),
  forms: rateLimit({ windowMs: 60 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, handler: limiterHandler, skip }),
  search: rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, handler: limiterHandler, skip }),
  checkout: rateLimit({ windowMs: 10 * 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, handler: limiterHandler, skip }),
};

module.exports = { csrfGuard, sanitizeInput, limiters };
