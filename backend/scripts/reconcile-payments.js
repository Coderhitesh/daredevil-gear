'use strict';

/* eslint-disable no-console */
/** Manually reconcile pending orders with CCAvenue and expire stale ones. */
const { run } = require('./lib/cli');
const payments = require('../src/services/payment.service');
const { Order } = require('../src/models');

run('reconcile:payments', async () => {
  const pending = await Order.find({ status: { $in: ['pending_payment', 'payment_failed'] } }).limit(200);
  for (const o of pending) console.log(o.orderNumber, await payments.reconcileOrder(o));
  console.log(await payments.expireStaleOrders({ limit: 200 }));
});
