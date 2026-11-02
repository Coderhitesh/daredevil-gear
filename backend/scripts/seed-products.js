'use strict';

/* eslint-disable no-console */
/**
 * Import products from the business spreadsheet.
 *
 *   npm run seed:products                      # apply (idempotent)
 *   npm run seed:products -- --dry-run         # validate against the DB, change nothing
 *   npm run seed:products -- --offline         # parse + report only, no DB connection
 *   npm run seed:products -- --file=path.xlsx  # another workbook
 *   npm run seed:products -- --dev-stock=25    # DEVELOPMENT ONLY: opening stock for rows without a stock quantity
 *
 * Reports are written to backend/reports/ (import-report.md, price-reconciliation.csv, products.csv, import-report.json).
 */
const path = require('path');
const { run, args } = require('./lib/cli');

const DEFAULT_FILE = path.resolve(__dirname, '../data/DDG_WEBSITE_PRODUCT_DETAILS_Corrected.xlsx');
const REPORT_DIR = path.resolve(__dirname, '../reports');

async function main(opts) {
  const file = opts.file ? path.resolve(opts.file) : DEFAULT_FILE;
  const devStock = opts['dev-stock'] ? parseInt(opts['dev-stock'], 10) : null;
  if (devStock && process.env.NODE_ENV === 'production') throw new Error('--dev-stock is not allowed in production');
  const { writeReports } = require('../src/services/import/report-writer');

  let report;
  if (opts.offline) {
    const { parseWorkbook } = require('../src/services/import/product-parser');
    const { computeVariantGroups } = require('../src/services/import/product-importer');
    const parsed = await parseWorkbook(file);
    computeVariantGroups(parsed.records);
    report = {
      ...parsed.report,
      summary: { dryRun: true, offline: true, totalSourceRows: parsed.report.totals.sourceRows, validRecords: parsed.records.length, created: 0, updated: 0, unchanged: 0, archived: parsed.records.filter((r) => r.status === 'archived').length, skipped: parsed.report.skipped.length, duplicates: parsed.report.duplicates.length, missingImages: parsed.records.filter((r) => !r.image).length, missingSkus: 0, invalidPrices: 0, gstInconsistencies: parsed.report.gstInconsistencies.length, visibilityConflicts: parsed.report.visibilityConflicts.length, needsReview: parsed.records.filter((r) => r.status === 'review').length },
      products: parsed.records.map((r) => ({ sku: null, name: r.name, action: 'parse', status: r.status, importStatus: r.status, department: r.department.name, sourceCategory: r.sourceCategory, source: `${r.source.sheet}!${r.source.row}`, priceInclusive: r.pricing.priceInclusive / 100, gstRate: r.pricing.gstRate, gstRule: r.pricing.gstRule, hsn: r.hsnCode, packaging: r.packagingCharge / 100, stock: r.stock, statusReasons: r.statusReasons, blockingFlags: r.flags.filter((f) => f.severity === 'blocking'), warnings: r.flags.filter((f) => f.severity === 'warning'), issues: r.issues, needsReview: r.status === 'review' })),
    };
  } else {
    const { importProducts } = require('../src/services/import/product-importer');
    report = await importProducts({ file, dryRun: Boolean(opts['dry-run']), devStock });
  }

  const files = writeReports(report, REPORT_DIR);
  const s = report.summary;
  console.log(`\nProduct import ${s.dryRun ? '(dry run)' : ''}`);
  console.table({
    'source rows': s.totalSourceRows,
    'valid records': s.validRecords,
    created: s.created,
    updated: s.updated,
    unchanged: s.unchanged,
    archived: s.archived,
    skipped: s.skipped,
    duplicates: s.duplicates,
    'missing images': s.missingImages,
    'GST/price issues': s.gstInconsistencies,
    'visibility conflicts': s.visibilityConflicts,
    'needs review': s.needsReview,
  });
  console.log('Reports:\n' + files.map((f) => '  ' + f).join('\n'));
}

const opts = args();
run('seed:products', () => main(opts), { db: !opts.offline });
