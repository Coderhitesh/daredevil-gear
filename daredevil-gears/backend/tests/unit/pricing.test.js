'use strict';

const pricing = require('../../src/services/pricing.service');
const { allocate, splitInclusive, toPaise } = require('../../src/utils/money');

const product = (over = {}) => ({ _id: 'p1', name: 'Item', pricing: { priceInclusive: 129682, gstRate: 18, gstRule: 'fixed' }, packagingCharge: 5000, ...over });

describe('money helpers', () => {
  test('toPaise handles floats from the spreadsheet', () => {
    expect(toPaise(2539.9499999999998)).toBe(253995);
    expect(toPaise('1,296.82')).toBeNull();
    expect(toPaise(undefined)).toBeNull();
  });

  test('splitInclusive separates GST from an inclusive amount', () => {
    expect(splitInclusive(129682, 18)).toEqual({ taxable: 109900, tax: 19782 });
    expect(splitInclusive(52395, 5)).toEqual({ taxable: 49900, tax: 2495 });
  });

  test('allocate preserves the exact total', () => {
    const parts = allocate(1001, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1001);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
  });
});

describe('GST rate rules', () => {
  test('fixed rate uses the product rate', () => {
    expect(pricing.gstRateFor(product(), 129682)).toBe(18);
  });

  test('apparel/footwear threshold: ≤ ₹2,500 per piece → 5%, above → 18%', () => {
    const cap = product({ pricing: { priceInclusive: 52395, gstRate: 5, gstRule: 'apparel_threshold' } });
    expect(pricing.gstRateFor(cap, 52395)).toBe(5);
    const shoe = product({ pricing: { priceInclusive: 318600, gstRate: 18, gstRule: 'apparel_threshold' } });
    expect(pricing.gstRateFor(shoe, 318600)).toBe(18);
    // boundary: taxable exactly ₹2,500 at 5% → 5%
    expect(pricing.gstRateFor(shoe, 262500)).toBe(5);
  });

  test('a discount that brings apparel under the threshold lowers the rate', () => {
    const glove = { _id: 'g', pricing: { priceInclusive: 318600, gstRate: 18, gstRule: 'apparel_threshold' }, packagingCharge: 0 };
    const q = pricing.quote({ lines: [{ product: glove, variant: {}, quantity: 1 }], coupon: { discount: 100000, eligibleLineIdx: [0], code: 'X' } });
    expect(q.items[0].gstRate).toBe(5);
  });
});

describe('price quote', () => {
  test('tax-inclusive totals with packaging and shipping disclosed separately', () => {
    const q = pricing.quote({ lines: [{ product: product(), variant: {}, quantity: 2 }], shipping: { charge: 9900 }, packagingMode: 'per_line', shipState: 'Uttar Pradesh' });
    expect(q.totals.itemsTotal).toBe(259364);
    expect(q.totals.packagingCharge).toBe(5000);
    expect(q.totals.shippingCharge).toBe(9900);
    expect(q.totals.grandTotal).toBe(259364 + 5000 + 9900);
    // GST is included, never added on top
    expect(q.totals.taxTotal).toBe(q.totals.taxBreakup.reduce((s, b) => s + b.tax, 0));
    expect(q.totals.supplyType).toBe('intra');
    expect(q.totals.cgst + q.totals.sgst).toBe(q.totals.taxTotal);
  });

  test('inter-state supply uses IGST', () => {
    const q = pricing.quote({ lines: [{ product: product(), variant: {}, quantity: 1 }], shipState: 'Maharashtra' });
    expect(q.totals.supplyType).toBe('inter');
    expect(q.totals.igst).toBe(q.totals.taxTotal);
  });

  test('packaging modes', () => {
    const lines = [
      { product: product({ packagingCharge: 5000 }), variant: {}, quantity: 3 },
      { product: product({ packagingCharge: 1600 }), variant: {}, quantity: 1 },
    ];
    expect(pricing.packagingFor(lines, 'per_line')).toEqual([5000, 1600]);
    expect(pricing.packagingFor(lines, 'per_unit')).toEqual([15000, 1600]);
    expect(pricing.packagingFor(lines, 'per_order_max')).toEqual([5000, 0]);
    expect(pricing.packagingFor(lines, 'included')).toEqual([0, 0]);
  });

  test('coupon discount is allocated across eligible lines only', () => {
    const lines = [
      { product: product(), variant: {}, quantity: 1 },
      { product: product({ _id: 'p2' }), variant: {}, quantity: 1 },
    ];
    const q = pricing.quote({ lines, coupon: { discount: 10000, eligibleLineIdx: [1], code: 'SAVE' } });
    expect(q.items[0].discount).toBe(0);
    expect(q.items[1].discount).toBe(10000);
    expect(q.totals.discount).toBe(10000);
  });

  test('sale price only applies inside its window', () => {
    const now = new Date('2026-10-27T10:00:00Z');
    const p = product({ pricing: { priceInclusive: 100000, gstRate: 18, sale: { active: true, priceInclusive: 90000, startsAt: new Date('2026-10-20'), endsAt: new Date('2026-10-30') } } });
    expect(pricing.unitPrice(p, {}, now)).toMatchObject({ unit: 90000, regular: 100000, onSale: true });
    expect(pricing.unitPrice(p, {}, new Date('2026-11-05')).onSale).toBe(false);
    // a "sale" price not lower than the regular price is ignored
    const bad = product({ pricing: { priceInclusive: 100000, gstRate: 18, sale: { active: true, priceInclusive: 110000 } } });
    expect(pricing.unitPrice(bad, {}, now).onSale).toBe(false);
  });

  test('reconcile flags rows where inclusive ≠ base × (1 + GST)', () => {
    expect(pricing.reconcile({ basePaise: 109900, gstRate: 18, inclusivePaise: 129682 }).ok).toBe(true);
    expect(pricing.reconcile({ basePaise: 109900, gstRate: 18, inclusivePaise: 134682 }).ok).toBe(false);
  });
});
