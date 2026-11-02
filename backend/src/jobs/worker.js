'use strict';

/**
 * Background worker for BullMQ queues (emails with retries). Run with `npm run worker`.
 * Requires REDIS_URL. Without Redis, jobs run inside the API process instead.
 */
const env = require('../config/env');
const logger = require('../config/logger');
const { connectDB } = require('../config/db');
const queue = require('./queue');
const scheduler = require('./scheduler');
require('../services/email.service'); // registers the email handler
require('../services/shiprocket-sync.service'); // registers the Shiprocket push handler

async function main() {
  if (!env.REDIS_URL) {
    logger.error('REDIS_URL is not set — the worker has nothing to process');
    process.exit(1);
  }
  await connectDB();
  const workers = queue.startWorkers();
  // Run the payment reconcile / pending-order expiry schedule here so clustered API processes
  // don't all run it (set RUN_SCHEDULER=false on the API when a worker is deployed).
  if (process.env.RUN_SCHEDULER !== 'false') scheduler.start();
  logger.info({ queues: workers.length }, 'Worker started');
  const stop = async () => {
    scheduler.stop();
    await Promise.all(workers.map((w) => w.close()));
    await queue.close();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main();
