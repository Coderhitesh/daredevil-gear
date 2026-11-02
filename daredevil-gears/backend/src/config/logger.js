'use strict';

const pino = require('pino');
const env = require('./env');

const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: 'ddg-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.otp',
      '*.code',
      '*.token',
      '*.razorpay_signature',
      '*.secret',
    ],
    censor: '[redacted]',
  },
});

module.exports = logger;
