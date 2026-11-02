'use strict';

/* eslint-disable no-console */
/**
 * seed:all = categories → products (from the spreadsheet) → content/config → super admin (if env set).
 * Every step is idempotent.
 */
require('../src/config/env'); // loads .env so SUPER_ADMIN_* can come from it
const { spawnSync } = require('child_process');
const path = require('path');

const passthrough = process.argv.slice(2);
const steps = [
  ['seed-categories.js', []],
  ['seed-products.js', passthrough.filter((a) => a.startsWith('--dev-stock') || a.startsWith('--file'))],
  ['seed-content.js', []],
];
if (process.env.SUPER_ADMIN_EMAIL && process.env.SUPER_ADMIN_PASSWORD) steps.push(['seed-admin.js', []]);
else console.log('ℹ SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set in the shell — skipping seed:admin');

for (const [script, args] of steps) {
  console.log(`\n▶ ${script} ${args.join(' ')}`);
  const res = spawnSync(process.execPath, [path.join(__dirname, script), ...args], { stdio: 'inherit', env: process.env });
  if (res.status !== 0) {
    console.error(`✖ ${script} failed`);
    process.exit(res.status || 1);
  }
}
console.log('\n✔ seed:all complete');
