'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const crypto = require('crypto');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');

const env = require('./config/env');
const logger = require('./config/logger');
const { asyncHandler } = require('./utils/http');
const { csrfGuard, sanitizeInput, limiters } = require('./middleware/security');
const { optionalCustomer } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/error');
const checkoutController = require('./controllers/checkout.controller');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/ready' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      serializers: { req: (req) => ({ id: req.id, method: req.method, url: req.url.split('?')[0] }) },
    })
  );
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    })
  );
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'x-ddg-csrf', 'x-ddg-order-token', 'x-request-id'],
      maxAge: 600,
    })
  );
  app.use(compression());

  // health checks (no auth, no rate limit)
  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: Math.round(process.uptime()) }));
  app.get('/ready', (_req, res) => {
    const dbOk = mongoose.connection.readyState === 1;
    res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ready' : 'not_ready', db: dbOk });
  });

  // CCAvenue sends the customer back with a form POST (no CSRF header possible) — mounted before CSRF; the body is AES-encrypted with our working key.
  app.post('/api/v1/payments/ccavenue/response', express.urlencoded({ extended: false, limit: '50kb' }), asyncHandler(checkoutController.ccavenueResponse));

  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use(cookieParser());
  app.use(sanitizeInput);
  app.use('/api', limiters.global, csrfGuard);

  // API documentation
  const openapi = require('./docs/openapi');
  app.get('/api/docs/openapi.json', (_req, res) => res.json(openapi));
  if (!env.isProd) {
    app.use('/api/docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'DareDevil Gears API' }));
  }

  const v1 = express.Router();
  v1.use('/admin', require('./routes/admin'));
  v1.use(optionalCustomer);
  v1.use('/auth', require('./routes/auth.routes'));
  v1.use(require('./routes/catalog.routes'));
  v1.use(require('./routes/cart.routes'));
  v1.use(require('./routes/checkout.routes'));
  v1.use(require('./routes/account.routes'));
  v1.use(require('./routes/content.routes'));
  app.use('/api/v1', v1);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
