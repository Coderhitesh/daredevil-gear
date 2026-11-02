'use strict';

const compliance = require('../../src/services/compliance.service');
const crypto = require('../../src/utils/crypto');
const shipping = require('../../src/services/shipping.service');
const orders = require('../../src/services/order.service');
const { sniff, IMAGE_TYPES, XLSX_TYPES } = require('../../src/services/upload.service');
const { passwordProblem } = require('../../src/services/password.service');
const { parseSpecs } = require('../../src/services/import/product-parser');
const { departmentFor } = require('../../src/services/import/catalog-map');

describe('compliance scanner', () => {
  test('flags unsubstantiated protection claims as blocking', () => {
    const { flags } = compliance.scanProduct({ name: 'Tactical Helmet', description: 'Protects against ballistic threats. NIJ IIIA rated Kevlar shell.' });
    const codes = flags.filter((f) => f.severity === 'blocking').map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['claim_ballistic', 'claim_nij', 'claim_kevlar']));
  });

  test('does not flag negated wording ("Non-ballistic", "not bulletproof")', () => {
    const { flags } = compliance.scanProduct({ name: 'Tactical Airsoft Helmet - Non-Ballistic', description: 'NOT BULLETPROOF - not for ballistic or life-saving protection.' });
    expect(flags.filter((f) => f.severity === 'blocking')).toHaveLength(0);
  });

  test('"ballistic nylon" is a fabric warning, not a blocking claim', () => {
    const { flags } = compliance.scanProduct({ name: 'Bag', description: 'Made from 1000D ballistic-grade nylon.' });
    expect(flags.find((f) => f.code === 'claim_ballistic')).toBeUndefined();
    expect(flags.find((f) => f.code === 'ballistic_fabric_wording')).toBeDefined();
  });

  test('restricted products get age/destination restrictions', () => {
    expect(compliance.scanProduct({ name: 'Pepper Spray', description: '' }).restrictions).toMatchObject({ minAge: 18, domesticOnly: true, returnable: false });
    expect(compliance.scanProduct({ name: 'Multi-Tool Folding Knife', description: '' }).restrictions).toMatchObject({ minAge: 18, domesticOnly: true });
    const stun = compliance.scanProduct({ name: 'Stun Gloves - Restricted Sale', description: '' });
    expect(stun.restrictions.legalReview).toBe(true);
  });

  test('placeholder and internal-note specs are hidden from customers', () => {
    expect(compliance.classifySpec({ label: 'Power output', value: 'TO ADD (kW)' }).isPublic).toBe(false);
    expect(compliance.classifySpec({ label: 'Safety standard', value: "State ANSI Z87.1 only when the supplier's test report is on file" }).isPublic).toBe(false);
    expect(compliance.classifySpec({ label: 'Body', value: 'Aluminium alloy' }).isPublic).toBe(true);
  });

  test('publish blockers include open blocking flags and pending legal review', () => {
    const blockers = compliance.publishBlockers({ pricing: { priceInclusive: 100 }, category: 'c', flags: [{ severity: 'blocking', message: 'X' }], compliance: { legalReview: { required: true, status: 'pending' } } });
    expect(blockers).toEqual(['X', 'Legal review not approved']);
  });
});

describe('spreadsheet spec parsing', () => {
  test('splits "Label: value" lines and feature bullets', () => {
    const { specifications, features } = parseSpecs('Body: Aluminium alloy  Modes: High / Low  Rainproof quick-drying poncho.');
    expect(specifications).toEqual([expect.objectContaining({ label: 'Body', value: 'Aluminium alloy' }), expect.objectContaining({ label: 'Modes', value: 'High / Low' })]);
    expect(features).toEqual(['Rainproof quick-drying poncho.']);
  });

  test('department mapping is deterministic', () => {
    expect(departmentFor({ name: 'DareDevil Seeker 23 Laptop Backpack - Topo Grey', sourceCategory: 'Adventure Maniacs' }).code).toBe('BAG');
    expect(departmentFor({ name: 'Camping Emergency Lantern', sourceCategory: 'Adventure Maniacs' }).code).toBe('LGT');
    expect(departmentFor({ name: 'Flemex Cool-24 Engine Coolant (1 L)', sourceCategory: 'Engine Oil' }).code).toBe('VGC');
    expect(departmentFor({ name: 'Kashmiri Kani Cape Coat', sourceCategory: 'Memsahab Corner' }).code).toBe('MEM');
  });
});

describe('crypto', () => {
  test('OTP is 6 random digits', () => {
    const codes = new Set(Array.from({ length: 200 }, () => crypto.generateOtp()));
    for (const c of codes) expect(c).toMatch(/^\d{6}$/);
    expect(codes.size).toBeGreaterThan(190);
  });

  test('TOTP verifies within the window and rejects others', () => {
    const secret = crypto.generateTotpSecret();
    const now = Date.now();
    expect(crypto.verifyTotp(secret, crypto.totp(secret, { time: now }), { time: now })).toBe(true);
    expect(crypto.verifyTotp(secret, crypto.totp(secret, { time: now - 30_000 }), { time: now })).toBe(true);
    expect(crypto.verifyTotp(secret, crypto.totp(secret, { time: now - 120_000 }), { time: now })).toBe(false);
    expect(crypto.verifyTotp(secret, 'abc')).toBe(false);
  });

  test('RFC 6238 test vector (SHA1, T=59)', () => {
    const secret = Buffer.from('12345678901234567890');
    const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const b of secret) bits += b.toString(2).padStart(8, '0');
    const b32 = bits.match(/.{1,5}/g).map((c) => B32[parseInt(c.padEnd(5, '0'), 2)]).join('');
    expect(crypto.totp(b32, { time: 59_000, digits: 8 })).toBe('94287082');
  });

  test('password policy', () => {
    expect(passwordProblem('short1')).toMatch(/10 characters/);
    expect(passwordProblem('onlyletterslong')).toMatch(/letters and numbers/);
    expect(passwordProblem('password123')).toBeTruthy();
    expect(passwordProblem('Trek-2026-Himalaya')).toBeNull();
  });
});

describe('shipping', () => {
  const rate = { type: 'weight_slab', slabs: [{ maxKg: 0.5, charge: 15900 }, { maxKg: 1, charge: 16900 }, { maxKg: 5, charge: 20900 }], beyondPerKg: 5000 };
  test('weight slab charges', () => {
    expect(shipping.rateCharge(rate, 0.4)).toBe(15900);
    expect(shipping.rateCharge(rate, 1)).toBe(16900);
    expect(shipping.rateCharge(rate, 7)).toBe(20900 + 2 * 5000);
    expect(shipping.rateCharge({ type: 'flat', flatCharge: 9900 }, 50)).toBe(9900);
  });

  test('zone matching by state and PIN prefix', () => {
    const z = { countries: ['IN'], states: ['Delhi'], pincodePrefixes: ['110'] };
    expect(shipping.zoneMatches(z, { country: 'IN', state: 'Delhi', pincode: '110001' })).toBe(true);
    expect(shipping.zoneMatches(z, { country: 'IN', state: 'Delhi', pincode: '201310' })).toBe(false);
  });

  test('legal restrictions cannot be bypassed by shipping rules', () => {
    const pepper = { _id: 'x', name: 'Pepper Spray', compliance: { minAge: 18, domesticOnly: true } };
    const r = shipping.restrictions([{ product: pepper, quantity: 1 }], { country: 'AE' });
    expect(r.blocked[0].reason).toMatch(/India only/);
    expect(r.requiresAgeConfirmation).toBe(true);
  });

  test('PIN code validation', () => {
    expect(shipping.validPincode('201310')).toBe(true);
    expect(shipping.validPincode('012345')).toBe(false);
  });
});

describe('order state machine', () => {
  test('allowed and forbidden transitions', () => {
    expect(orders.canTransition('confirmed', 'processing', 'admin')).toBe(true);
    expect(orders.canTransition('pending_payment', 'confirmed', 'admin')).toBe(false); // only payment verification confirms
    expect(orders.canTransition('pending_payment', 'confirmed', 'system')).toBe(true);
    expect(orders.canTransition('delivered', 'cancelled', 'admin')).toBe(false);
    expect(orders.canTransition('shipped', 'delivered', 'admin')).toBe(true);
    expect(orders.canTransition('cancelled', 'processing', 'admin')).toBe(false);
  });
});

describe('upload validation', () => {
  test('checks real file signatures, not the declared type', () => {
    expect(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), IMAGE_TYPES)).toBe('image/png');
    expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), IMAGE_TYPES)).toBe('image/jpeg');
    expect(sniff(Buffer.from('<?php echo 1; ?>'), IMAGE_TYPES)).toBeNull();
    expect(sniff(Buffer.from([0x50, 0x4b, 0x03, 0x04]), XLSX_TYPES)).toBeTruthy();
  });
});
