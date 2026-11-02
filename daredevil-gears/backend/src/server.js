'use strict';

const env = require('./config/env');
const logger = require('./config/logger');
const { connectDB, disconnectDB } = require('./config/db');
const { createApp } = require('./app');
const scheduler = require('./jobs/scheduler');
const queue = require('./jobs/queue');
const settings = require('./services/settings.service');
const tax = require('./services/tax.service');

async function start() {
  await connectDB();
  await settings.ensureDefaults();
  await tax.ensureDefault();

  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info({ port: env.PORT, env: env.NODE_ENV }, 'DareDevil Gears API listening'));
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  // Check SMTP once at startup so a bad password shows up in the log immediately, not at a customer's sign-up.
  if (env.SMTP_HOST && !env.isTest) {
    require('./services/smtp')
      .verify()
      .then((r) => (r.ok ? logger.info({ host: env.SMTP_HOST, port: env.SMTP_PORT }, 'SMTP connection OK') : logger.error({ host: env.SMTP_HOST, port: env.SMTP_PORT, error: r.error }, `SMTP check failed: ${r.hint}`)))
      .catch(() => {});
  } else if (!env.SMTP_HOST) {
    logger.warn('SMTP_HOST is not set: emails (including sign-up codes) are written to backend/.outbox');
  }
  require('./services/shiprocket-sync.service'); // registers the Shiprocket push job handler
  const srp = require('./services/shipping-provider.service');
  if (srp.enabled() && !env.isTest) {
    srp
      .login()
      .then(() => logger.info('Shiprocket login OK'))
      .catch((err) => logger.error(`Shiprocket check failed: ${err.message}`));
  } else if (!env.isTest) {
    logger.warn('Shiprocket is not configured (SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD): delivery charges come from Admin → Shipping zones, orders are not sent to Shiprocket');
  }
  if (!env.razorpayConfigured) logger.warn('Razorpay keys are not set: checkout stops before payment with "Online payment is not configured yet"');
  else if (!env.isTest) {
    const rzp = require('./services/razorpay.service');
    rzp
      .getClient()
      .orders.all({ count: 1 })
      .then(() => logger.info({ mode: String(env.RAZORPAY_KEY_ID).startsWith('rzp_live_') ? 'live' : 'test' }, 'Razorpay keys OK'))
      .catch((err) => logger.error(`Razorpay check failed: ${rzp.explain(err)}`));
  }

  if (process.env.RUN_SCHEDULER !== 'false') scheduler.start();
  const workers = process.env.RUN_WORKER_INLINE === 'true' ? queue.startWorkers() : [];

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully');
    scheduler.stop();
    server.close(async () => {
      try {
        await Promise.all(workers.map((w) => w.close()));
        await queue.close();
        await disconnectDB();
      } finally {
        process.exit(0);
      }
    });
    setTimeout(() => process.exit(1), 15_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled promise rejection'));
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start API');
  process.exit(1);
});
