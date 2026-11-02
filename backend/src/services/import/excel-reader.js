'use strict';

const ExcelJS = require('exceljs');

/** Resolve an ExcelJS cell value to a primitive. Formula errors become { error: '#REF!' }. */
function cellValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return v;
  if (v instanceof Date) return v;
  if (v.richText) return v.richText.map((r) => r.text).join('');
  if (v.text !== undefined && v.hyperlink) return v.text;
  if (v.error) return { error: v.error };
  if ('formula' in v || 'sharedFormula' in v) {
    const r = v.result;
    if (r && typeof r === 'object' && r.error) return { error: r.error };
    return r === undefined ? { error: '#NO_CACHED_RESULT' } : r;
  }
  return String(v);
}

function headerKey(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Read every worksheet into { name, rows: [{ rowNumber, cells: { [colNumber]: value } }] }.
 */
async function readWorkbook(fileOrBuffer) {
  const wb = new ExcelJS.Workbook();
  if (Buffer.isBuffer(fileOrBuffer)) await wb.xlsx.load(fileOrBuffer);
  else await wb.xlsx.readFile(fileOrBuffer);
  const sheets = [];
  wb.eachSheet((ws) => {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells = {};
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const val = cellValue(cell.value);
        if (val !== null && val !== '') cells[col] = val;
      });
      if (Object.keys(cells).length) rows.push({ rowNumber, cells, hidden: Boolean(row.hidden) });
    });
    sheets.push({ name: ws.name, state: ws.state, rows });
  });
  return sheets;
}

/**
 * Locate a header row by required labels and return a column map { field: colNumber }.
 * `spec` maps field -> predicate(headerText, subHeaderText).
 */
function locateColumns(sheet, spec, { maxScan = 6 } = {}) {
  for (let i = 0; i < Math.min(maxScan, sheet.rows.length); i++) {
    const row = sheet.rows[i];
    const next = sheet.rows[i + 1];
    const map = {};
    for (const [field, pred] of Object.entries(spec)) {
      for (const [col, val] of Object.entries(row.cells)) {
        const sub = next?.rowNumber === row.rowNumber + 1 ? next.cells[col] : undefined;
        if (pred(headerKey(val), headerKey(sub))) {
          map[field] = Number(col);
          break;
        }
      }
    }
    const required = Object.keys(spec).filter((k) => !k.startsWith('opt_'));
    if (required.every((k) => map[k])) return { columns: map, headerRow: row.rowNumber };
  }
  return null;
}

module.exports = { readWorkbook, locateColumns, cellValue, headerKey };
