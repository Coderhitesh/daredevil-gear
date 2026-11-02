'use strict';

/**
 * Background job queue.
 *  - With REDIS_URL: BullMQ queues with exponential-backoff retries; processed by `npm run worker`
 *    (or in-process when RUN_WORKER_INLINE=true).
 *  - Without Redis (local dev/tests): in-process execution with the same retry policy.
 */
const env = require('../config/env');
const logger = require('../config/logger');

const handlers = new Map();
const queues = new Map();
let connection = null;

const RETRY = { attempts: 5, backoff: { type: 'exponential', delay: 15_000 } };

function getConnection() {
  if (!env.REDIS_URL) return null;
  if (!connection) {
    const IORedis = require('ioredis');
    connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}

function registerHandler(name, fn) {
  handlers.set(name, fn);
}

async function enqueue(name, payload, opts = {}) {
  const conn = getConnection();
  if (conn) {
    const { Queue } = require('bullmq');
    if (!queues.has(name)) queues.set(name, new Queue(name, { connection: conn }));
    await queues.get(name).add(name, payload, { ...RETRY, removeOnComplete: 1000, removeOnFail: 5000, ...opts });
    return;
  }
  runInline(name, payload, 1);
}

function runInline(name, payload, attempt) {
  const handler = handlers.get(name);
  if (!handler) {
    logger.error({ name }, 'No handler registered for job');
    return;
  }
  setImmediate(async () => {
    try {
      await handler(payload);
    } catch (err) {
      if (attempt < RETRY.attempts && !env.isTest) {
        const delay = RETRY.backoff.delay * 2 ** (attempt - 1);
        logger.warn({ name, attempt, delay }, 'Job failed; retrying');
        setTimeout(() => runInline(name, payload, attempt + 1), delay).unref();
      } else {
        logger.error({ name, err: err.message }, 'Job failed permanently');
      }
    }
  });
}

function startWorkers() {
  const conn = getConnection();
  if (!conn) return [];
  const { Worker } = require('bullmq');
  return [...handlers.keys()].map((name) => {
    const worker = new Worker(name, async (job) => handlers.get(name)(job.data), { connection: conn, concurrency: 5 });
    worker.on('failed', (job, err) => logger.error({ name, id: job?.id, attempts: job?.attemptsMade, err: err.message }, 'Job failed'));
    return worker;
  });
}

async function close() {
  for (const q of queues.values()) await q.close();
  if (connection) await connection.quit();
}

module.exports = { registerHandler, enqueue, startWorkers, close };
