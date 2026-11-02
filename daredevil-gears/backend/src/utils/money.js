'use strict';

/**
 * All money is integer paise. Never use floats for persisted amounts.
 */

function toPaise(rupees) {
  if (rupees === null || rupees === undefined || rupees === '') return null;
  const n = Number(rupees);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function toRupees(paise) {
  return Math.round(Number(paise || 0)) / 100;
}

/** Split a GST-inclusive amount into taxable value + tax (rate in percent). */
function splitInclusive(inclusivePaise, ratePct) {
  const rate = Number(ratePct) || 0;
  const taxable = Math.round((inclusivePaise * 100) / (100 + rate));
  return { taxable, tax: inclusivePaise - taxable };
}

/** Add GST to a taxable amount. */
function addTax(taxablePaise, ratePct) {
  const tax = Math.round((taxablePaise * (Number(ratePct) || 0)) / 100);
  return { taxable: taxablePaise, tax, inclusive: taxablePaise + tax };
}

/**
 * Allocate an amount across weights proportionally, preserving the exact total
 * (largest-remainder method). Used to spread order discounts/shipping across lines.
 */
function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || !total) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) floors[order[k][1]] += 1;
  return floors;
}

module.exports = { toPaise, toRupees, splitInclusive, addTax, allocate };
