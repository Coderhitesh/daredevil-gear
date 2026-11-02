'use strict';

const { ShippingZone, ShippingRate } = require('../models');
const settings = require('./settings.service');
const { ApiError } = require('../utils/http');
const logger = require('../config/logger');
const shiprocket = require('./shipping-provider.service');

const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

function validPincode(pin, country = 'IN') {
  if (country !== 'IN') return true;
  return /^[1-9]\d{5}$/.test(String(pin || '').trim());
}

function chargeableWeight(lines, fallbackKg) {
  return lines.reduce((sum, l) => sum + l.quantity * (l.variant?.weightKg || l.product.weightKg || fallbackKg || 1), 0);
}

function rateCharge(rate, weightKg) {
  if (rate.type === 'flat') return rate.flatCharge || 0;
  const slabs = [...(rate.slabs || [])].sort((a, b) => a.maxKg - b.maxKg);
  if (!slabs.length) return rate.flatCharge || 0;
  const slab = slabs.find((s) => weightKg <= s.maxKg);
  if (slab) return slab.charge;
  const last = slabs[slabs.length - 1];
  return last.charge + Math.round((weightKg - last.maxKg) * (rate.beyondPerKg || 0));
}

function zoneMatches(zone, { country, state, pincode }) {
  if (zone.countries?.length && !zone.countries.includes(country)) return false;
  if (zone.states?.length && !zone.states.some((s) => norm(s) === norm(state))) return false;
  if (zone.pincodePrefixes?.length && !zone.pincodePrefixes.some((p) => String(pincode).startsWith(p))) return false;
  if (zone.excludedPincodes?.includes(String(pincode))) return false;
  return true;
}

function specificity(z) {
  return (z.pincodePrefixes?.length ? 100 : 0) + (z.states?.length ? 10 : 0) + (z.countries?.length ? 1 : 0);
}

/**
 * Legal / carrier restrictions. These are checked before any shipping rule and cannot be overridden by one.
 * Returns { blocked: [{productId, name, reason}], requiresAgeConfirmation }.
 */
function restrictions(lines, { country = 'IN', state } = {}) {
  const blocked = [];
  let requiresAgeConfirmation = false;
  for (const l of lines) {
    const c = l.product.compliance || {};
    if (c.minAge >= 18) requiresAgeConfirmation = true;
    if ((c.domesticOnly || c.dangerousGoods) && country !== 'IN') blocked.push({ productId: String(l.product._id), name: l.product.name, reason: 'Delivered within India only' });
    if (c.allowedCountries?.length && !c.allowedCountries.includes(country)) blocked.push({ productId: String(l.product._id), name: l.product.name, reason: `Not available for delivery to ${country}` });
    if (state && c.blockedStates?.some((s) => norm(s) === norm(state))) blocked.push({ productId: String(l.product._id), name: l.product.name, reason: `Cannot be delivered to ${state}` });
  }
  return { blocked, requiresAgeConfirmation };
}

function shiprocketActive(cfg, country) {
  return country === 'IN' && shiprocket.enabled() && cfg?.ratesEnabled && /^[1-9]\d{5}$/.test(cfg.pickupPincode || '');
}

/** "3" -> { min: 3, max: 3 } */
const daysRange = (d) => (d ? { min: d, max: d } : null);

/**
 * Shiprocket's live charge for a parcel, turned into checkout options.
 * The charge shown is Shiprocket's quoted rate (optionally + GST / handling as configured in Admin).
 * Free delivery from Settings → Shipping still applies on top.
 */
async function shiprocketQuote({ pincode, weightKg, declaredValue, netItemsTotal, cfg, ignoreFree = false, cod = false }) {
  const ship = await settings.get('shipping');
  const { couriers, recommendedId } = await shiprocket.serviceability({
    pickupPincode: cfg.pickupPincode,
    deliveryPincode: pincode,
    weightKg,
    declaredValue,
    lengthCm: cfg.lengthCm,
    breadthCm: cfg.breadthCm,
    heightCm: cfg.heightCm,
    cod,
  });
  if (!couriers.length) {
    if (cod) throw ApiError.unprocessable('Cash on delivery is not available for this PIN code. Please pay online.', { code: 'COD_NOT_SERVICEABLE' });
    throw ApiError.unprocessable('Sorry, no courier delivers to this PIN code yet.', { code: 'NOT_SERVICEABLE' });
  }

  const toPaise = (rupees) => Math.round(rupees * (cfg.addGstToRate ? 1.18 : 1) * 100) + (cfg.handlingCharge || 0);
  const byCost = [...couriers].sort((a, b) => a.rate - b.rate || (a.days || 99) - (b.days || 99));
  const byDays = [...couriers].sort((a, b) => (a.days || 99) - (b.days || 99) || a.rate - b.rate);

  let picks;
  if (cfg.courierChoice === 'recommended') picks = [couriers.find((c) => c.courierId === recommendedId) || byCost[0]].map((c) => ['standard', c]);
  else if (cfg.courierChoice === 'cheapest') picks = [['standard', byCost[0]]];
  else {
    picks = [['standard', byCost[0]]];
    const fast = byDays[0];
    if (fast.courierId !== byCost[0].courierId && fast.days && byCost[0].days && fast.days < byCost[0].days) picks.push(['express', fast]);
  }

  const globalFree = !ignoreFree && ship.freeShippingEnabled && ship.freeShippingThreshold ? ship.freeShippingThreshold : null;
  const options = picks.map(([method, c]) => {
    const threshold = method === 'standard' ? globalFree : null;
    const free = threshold != null && netItemsTotal >= threshold;
    const base = method === 'express' ? 'Express delivery' : 'Standard delivery';
    return {
      rateId: `sr_${c.courierId}`,
      zoneId: null,
      zoneName: 'Shiprocket',
      provider: 'shiprocket',
      courierId: c.courierId,
      courierName: c.courierName,
      name: cfg.showCourierName ? `${base} · ${c.courierName}` : base,
      method,
      charge: free ? 0 : toPaise(c.rate),
      providerCharge: toPaise(c.rate),
      codCharge: cod ? Math.round(c.codCharges * (cfg.addGstToRate ? 1.18 : 1) * 100) : 0,
      free,
      freeAbove: threshold,
      amountToFree: threshold != null && !free ? threshold - netItemsTotal : null,
      estimatedDays: daysRange(c.days),
      etd: c.etd,
    };
  });
  return { options, all: couriers.map((c) => ({ ...c, charge: toPaise(c.rate) })) };
}

/**
 * Delivery options for a destination. `netItemsTotal` (after coupon) is used for free-delivery thresholds.
 * Throws 422 when the destination is not serviceable.
 */
async function options({ lines, destination, netItemsTotal, paymentMethod = 'online' }) {
  const cod = paymentMethod === 'cod';
  const country = (destination.country || 'IN').toUpperCase();
  if (!validPincode(destination.pincode, country)) throw ApiError.unprocessable('Enter a valid 6-digit PIN code', { code: 'BAD_PINCODE' });
  const ship = await settings.get('shipping');
  if (country !== 'IN' && ship.internationalMode !== 'enabled') {
    throw ApiError.unprocessable('International orders are handled on request — please contact us for a delivery quote.', { code: 'INTERNATIONAL_QUOTE_ONLY' });
  }
  const r = restrictions(lines, { country, state: destination.state });
  if (r.blocked.length) {
    throw ApiError.unprocessable(`${r.blocked[0].name}: ${r.blocked[0].reason}`, { code: 'DESTINATION_RESTRICTED', details: r.blocked.map((b) => ({ field: b.productId, message: b.reason })) });
  }

  const weight = chargeableWeight(lines, ship.defaultItemWeightKg);

  // ---- live Shiprocket rates (Admin → Settings → Shiprocket)
  const srCfg = await settings.get('shiprocket');
  if (shiprocketActive(srCfg, country)) {
    try {
      const sr = await shiprocketQuote({ pincode: destination.pincode, weightKg: weight, declaredValue: netItemsTotal, netItemsTotal, cfg: srCfg, cod });
      return { zone: { id: null, name: 'Shiprocket' }, provider: 'shiprocket', weightKg: Math.round(weight * 100) / 100, options: sr.options, requiresAgeConfirmation: r.requiresAgeConfirmation };
    } catch (err) {
      if (err.status === 422) throw err; // genuinely not serviceable
      logger.error({ err: err.message, pincode: destination.pincode }, 'Shiprocket rates unavailable');
      if (!srCfg.fallbackToManualRates) throw ApiError.unavailable('Delivery charges could not be fetched right now. Please try again in a minute.', { code: 'RATES_UNAVAILABLE' });
    }
  }

  const zones = (await ShippingZone.find({ isActive: true }).lean()).filter((z) => zoneMatches(z, { country, state: destination.state, pincode: destination.pincode }));
  zones.sort((a, b) => specificity(b) - specificity(a) || (a.sortOrder || 0) - (b.sortOrder || 0));
  const zone = zones[0];
  if (!zone) throw ApiError.unprocessable('Sorry, we do not deliver to this PIN code yet.', { code: 'NOT_SERVICEABLE' });

  const rates = await ShippingRate.find({ zone: zone._id, isActive: true }).sort({ sortOrder: 1 }).lean();
  if (!rates.length) throw ApiError.unprocessable('Sorry, we do not deliver to this PIN code yet.', { code: 'NOT_SERVICEABLE' });

  const globalFree = ship.freeShippingEnabled && ship.freeShippingThreshold ? ship.freeShippingThreshold : null;
  const out = rates
    .filter((rate) => !rate.minOrderValue || netItemsTotal >= rate.minOrderValue)
    .map((rate) => {
      const threshold = rate.freeAbove ?? (rate.method === 'standard' ? globalFree : null);
      const free = threshold != null && netItemsTotal >= threshold;
      return {
        rateId: String(rate._id),
        zoneId: String(zone._id),
        zoneName: zone.name,
        name: rate.name,
        method: rate.method,
        charge: free ? 0 : rateCharge(rate, weight),
        free,
        freeAbove: threshold,
        amountToFree: threshold != null && !free ? threshold - netItemsTotal : null,
        estimatedDays: rate.estimatedDays?.min ? rate.estimatedDays : null,
      };
    })
    .sort((a, b) => a.charge - b.charge);
  return { zone: { id: String(zone._id), name: zone.name }, provider: 'manual', weightKg: Math.round(weight * 100) / 100, options: out, requiresAgeConfirmation: r.requiresAgeConfirmation };
}

/** Product-page serviceability/estimate check (no cart). */
async function checkPincode({ product, pincode }) {
  const lines = [{ product, quantity: 1 }];
  try {
    const result = await options({ lines, destination: { pincode, country: 'IN' }, netItemsTotal: product.pricing.priceInclusive });
    const best = result.options[0];
    return { serviceable: true, charge: best.charge, free: best.free, freeAbove: best.freeAbove, estimatedDays: best.estimatedDays, etd: best.etd || null, method: best.name, provider: result.provider };
  } catch (err) {
    if (err.status === 422) return { serviceable: false, message: err.message };
    throw err;
  }
}

module.exports = { INDIAN_STATES, options, shiprocketQuote, restrictions, checkPincode, rateCharge, chargeableWeight, zoneMatches, validPincode };
