'use strict';

/* eslint-disable no-console */
/** Build/sync all MongoDB indexes (production runs with autoIndex disabled). */
const { run } = require('./lib/cli');
const models = require('../src/models');

run('indexes', async () => {
  for (const [name, Model] of Object.entries(models)) {
    if (!Model?.syncIndexes) continue;
    const dropped = await Model.syncIndexes();
    console.log(`${name}: synced${dropped?.length ? ` (dropped ${dropped.join(', ')})` : ''}`);
  }
});
