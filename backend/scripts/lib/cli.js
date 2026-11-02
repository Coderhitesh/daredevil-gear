'use strict';

/* eslint-disable no-console */
const { connectDB, disconnectDB } = require('../../src/config/db');

function args() {
  const out = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

async function run(name, fn, { db = true } = {}) {
  const started = Date.now();
  try {
    if (db) await connectDB();
    await fn(args());
    console.log(`\n✔ ${name} finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    if (db) await disconnectDB();
    process.exit(0);
  } catch (err) {
    console.error(`\n✖ ${name} failed: ${err.message}`);
    if (process.env.DEBUG) console.error(err);
    if (db) await disconnectDB().catch(() => {});
    process.exit(1);
  }
}

module.exports = { run, args };
