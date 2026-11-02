'use strict';

/* eslint-disable no-console */
const { run } = require('./lib/cli');
const { ensureTaxonomy } = require('../src/services/import/product-importer');

run('seed:categories', async () => {
  const { categories, collections } = await ensureTaxonomy();
  console.log(`Departments: ${Object.values(categories).map((c) => c.slug).join(', ')}`);
  console.log(`Collections: ${Object.values(collections).map((c) => c.slug).join(', ')}`);
});
