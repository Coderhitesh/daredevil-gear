'use strict';

const fs = require('fs');
const path = require('path');

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function reconciliationCsv(report) {
  const head = ['Product', 'Sheet', 'Row', 'Base ex-GST (Rs)', 'GST %', 'Supplied incl. GST (Rs)', 'Expected incl. GST (Rs)', 'Difference (Rs)', 'Matches'];
  const rows = report.reconciliation.map((r) => [r.name, r.sheet, r.row, r.base, r.gst, r.inclusive, r.expected, r.diff, r.ok ? 'yes' : 'NO']);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

function productsCsv(report) {
  const head = ['SKU', 'Name', 'Action', 'Status', 'Department', 'Source group', 'Source', 'Price incl. GST', 'GST %', 'GST rule', 'HSN', 'Packaging', 'Stock', 'Needs review', 'Blocking issues', 'Warnings'];
  const rows = report.products.map((p) => [
    p.sku,
    p.name,
    p.action,
    p.status,
    p.department,
    p.sourceCategory,
    p.source,
    p.priceInclusive,
    p.gstRate,
    p.gstRule,
    p.hsn,
    p.packaging,
    p.stock ?? '',
    p.needsReview ? 'yes' : '',
    p.blockingFlags.map((f) => f.message).join(' | '),
    p.warnings.map((w) => w.code).join(' '),
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

function markdown(report) {
  const s = report.summary;
  const L = [];
  L.push('# Product import & validation report', '');
  L.push(`Generated: ${report.generatedAt}  `);
  L.push(`Mode: **${s.dryRun ? 'DRY RUN (no database changes)' : 'APPLIED'}**`, '');
  L.push('## Summary', '');
  L.push('| Metric | Count |', '| --- | ---: |');
  const rows = [
    ['Total source rows (all product sheets)', s.totalSourceRows],
    ['Distinct products after merging sheets', report.products.length],
    ['Valid product records', s.validRecords],
    ['Created', s.created],
    ['Updated', s.updated],
    ['Unchanged (idempotent re-run)', s.unchanged],
    ['Archived (removed from sale)', s.archived],
    ['Skipped rows (headers / blank / no price)', s.skipped],
    ['Duplicate records', s.duplicates],
    ['Missing images', s.missingImages],
    ['Missing SKUs', s.missingSkus],
    ['Invalid prices', s.invalidPrices],
    ['GST / price inconsistencies', s.gstInconsistencies],
    ['Unresolved visibility conflicts', s.visibilityConflicts],
    ['Products requiring manual review', s.needsReview],
  ];
  rows.forEach(([k, v]) => L.push(`| ${k} | ${v} |`));
  L.push('');

  const byStatus = report.products.reduce((a, p) => ({ ...a, [p.status]: (a[p.status] || 0) + 1 }), {});
  L.push('## Storefront visibility', '');
  Object.entries(byStatus).forEach(([k, v]) => L.push(`- **${k}**: ${v}`));
  L.push('', 'Only `published` products appear in navigation, listings and search. `review` items need content or legal sign-off in Admin → Products before they can be published.', '');

  const review = report.products.filter((p) => p.needsReview);
  if (review.length) {
    L.push('## Products requiring manual review', '');
    for (const p of review) {
      L.push(`### ${p.name} (${p.sku || 'no SKU'}) — ${p.status}`);
      p.statusReasons.forEach((r) => L.push(`- ${r}`));
      p.blockingFlags.forEach((f) => L.push(`- **${f.code}**: ${f.message}${f.evidence ? ` — “${f.evidence}”` : ''}`));
      p.issues.filter((i) => i.level !== 'info').forEach((i) => L.push(`- ${i.level}: ${i.message}`));
      L.push('');
    }
  }

  L.push('## Archived / removed products', '');
  report.products.filter((p) => p.status === 'archived').forEach((p) => L.push(`- ${p.name} — ${p.statusReasons.join('; ')}`));
  L.push('');

  L.push('## Price reconciliation (base × (1 + GST) vs supplied inclusive price)', '');
  const bad = report.reconciliation.filter((r) => !r.ok);
  if (!bad.length) L.push(`All ${report.reconciliation.length} rows reconcile to the paisa. Full table: \`price-reconciliation.csv\`.`);
  else bad.forEach((r) => L.push(`- ${r.name} (${r.sheet}!${r.row}): supplied ${r.inclusive}, expected ${r.expected}, diff ${r.diff}`));
  L.push('');

  L.push('## GST rule checks', '');
  if (!report.gstInconsistencies.length) L.push('Every "Apparel"/"Footwear" row matches the ≤ ₹2,500 → 5% / > ₹2,500 → 18% rule; every "Fixed" row matches its fixed rate.');
  else report.gstInconsistencies.forEach((g) => L.push(`- ${g.name}: rule ${g.rule}, stated ${g.stated}%, expected ${g.expected}%`));
  L.push('', '> HSN codes in the sheet are marked "indicative". All HSN/GST classifications must be confirmed by the company’s CA before launch (Admin → Tax).', '');

  L.push('## Cross-sheet conflicts', '');
  if (!report.conflicts.length) L.push('No conflicting prices or categories between the Products / Engine Oil sheets and the "Dare Devil All Product" sheet.');
  else report.conflicts.forEach((c) => L.push(`- ${c.name}: ${c.field} ${JSON.stringify(c.values)}`));
  L.push('');

  L.push('## Duplicates', '');
  if (!report.duplicates.length) L.push('None.');
  else report.duplicates.forEach((d) => L.push(`- ${d.name} (${d.rows.join(', ')}): ${d.resolution}`));
  L.push('');

  L.push('## Hide / remove list matching', '');
  if (report.visibilityConflicts.length) {
    L.push('Possible matches that were **not** applied automatically:');
    report.visibilityConflicts.forEach((v) => L.push(`- “${v.listEntry}” (${v.list} list) ↔ ${v.name}`));
    L.push('');
  }
  L.push('List entries that do not correspond to any product in this workbook (items/pages from the old website). They are stored in the catalogue blocklist so admins are warned if a product with that name is created:', '');
  (report.blocklistOnly || []).forEach((b) => L.push(`- [${b.list}] ${b.name}${b.reason ? ` — ${b.reason}` : ''}`));
  L.push('');

  L.push('## Skipped rows', '');
  report.skipped.forEach((s) => L.push(`- ${s.sheet}!${s.row}${s.name ? ` (${s.name})` : ''}: ${s.reason}`));
  if (report.errors.length) {
    L.push('', '## Errors', '');
    report.errors.forEach((e) => L.push(`- ${e.sheet}${e.row ? '!' + e.row : ''}: ${e.message}`));
  }
  L.push('');
  return L.join('\n');
}

function writeReports(report, dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'import-report.md'), markdown(report));
  fs.writeFileSync(path.join(dir, 'import-report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(dir, 'price-reconciliation.csv'), reconciliationCsv(report));
  fs.writeFileSync(path.join(dir, 'products.csv'), productsCsv(report));
  return ['import-report.md', 'import-report.json', 'price-reconciliation.csv', 'products.csv'].map((f) => path.join(dir, f));
}

module.exports = { writeReports, markdown, reconciliationCsv, productsCsv };
