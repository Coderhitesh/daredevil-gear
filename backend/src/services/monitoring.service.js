'use strict';

/**
 * Error monitoring hook. When SENTRY_DSN is set and @sentry/node is installed,
 * errors are forwarded to Sentry; otherwise they are logged only.
 */
const env = require('../config/env');
const logger = require('../config/logger');

let sentry = null;
if (env.SENTRY_DSN) {
  try {
    sentry = require('@sentry/node');
    sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0 });
    logger.info('Sentry error monitoring enabled');
  } catch {
    logger.warn('SENTRY_DSN set but @sentry/node is not installed — run `cd backend && npm i @sentry/node`');
  }
}

function capture(err, context = {}) {
  if (sentry) sentry.captureException(err, { extra: context });
}

module.exports = { capture };
