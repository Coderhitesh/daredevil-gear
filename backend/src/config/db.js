'use strict';

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

mongoose.set('strictQuery', true);
// NoSQL-injection defence lives in middleware/security.sanitizeInput + zod validation on every route.

let transactionsSupported = false;

async function connectDB(uri = env.MONGODB_URI) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, autoIndex: !env.isProd });
  transactionsSupported = await detectTransactions();
  logger.info({ transactionsSupported }, 'MongoDB connected');
  return mongoose.connection;
}

async function detectTransactions() {
  if (env.MONGODB_TRANSACTIONS === 'on') return true;
  if (env.MONGODB_TRANSACTIONS === 'off') return false;
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    return Boolean(hello.setName || hello.msg === 'isdbgrid');
  } catch {
    return false;
  }
}

/**
 * Runs fn inside a transaction when the deployment supports it (replica set / sharded).
 * Otherwise runs fn without a session; callers must use atomic conditional updates
 * and compensating actions (see inventory.service) so correctness never depends on transactions.
 */
async function withTransaction(fn) {
  if (!transactionsSupported) return fn(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = {
  connectDB,
  disconnectDB,
  withTransaction,
  get transactionsSupported() {
    return transactionsSupported;
  },
};
