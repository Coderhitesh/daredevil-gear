'use strict';

const { TaxConfiguration } = require('../models');
const { DEFAULT_TAX_CONFIG } = require('./pricing.service');

let cache = { at: 0, value: null };

async function get() {
  if (cache.value && Date.now() - cache.at < 30_000) return cache.value;
  const doc = await TaxConfiguration.findOne({ key: 'default' }).lean();
  const value = doc ? { ...DEFAULT_TAX_CONFIG, ...doc, apparelRule: { ...DEFAULT_TAX_CONFIG.apparelRule, ...(doc.apparelRule || {}) } } : { ...DEFAULT_TAX_CONFIG };
  cache = { at: Date.now(), value };
  return value;
}

async function update(patch, updatedBy) {
  const doc = await TaxConfiguration.findOneAndUpdate({ key: 'default' }, { $set: { ...patch, updatedBy } }, { upsert: true, new: true });
  cache = { at: 0, value: null };
  return doc;
}

async function ensureDefault() {
  await TaxConfiguration.updateOne(
    { key: 'default' },
    { $setOnInsert: { key: 'default', reviewedByAccountant: false, reviewNote: 'Apparel/footwear threshold rule (effective 22 Sept 2025), GST on packaging/delivery and all HSN codes must be confirmed by the company CA before launch.' } },
    { upsert: true }
  );
}

module.exports = { get, update, ensureDefault };
