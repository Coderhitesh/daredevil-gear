'use strict';

const { SiteSetting } = require('../models');

/**
 * Default settings. Values that come from the business documents are marked `requiresReview`
 * so the admin sees what still needs management/legal confirmation. Nothing here is invented:
 * empty strings mean "not supplied yet".
 */
const DEFAULTS = {
  business: {
    isPublic: true,
    requiresReview: true,
    reviewNote: 'Legal name, CIN and full registered address were not supplied. GSTIN is taken from the fix plan ("as listed on TradeIndia") and must be confirmed.',
    value: {
      displayName: 'DareDevil Gears',
      legalName: '',
      cin: '',
      gstin: '09AAJCD6096M1ZV',
      gstinVerified: false,
      registeredAddress: '',
      addressShort: 'Paramount Oak, Greater Noida, Uttar Pradesh',
      mapEmbedUrl: '',
      email: 'sales@daredevilgears.com',
      phone: '+91 92209 41377',
      whatsapp: '+919220941377',
      hours: 'Mon–Sat, 9:00 AM – 6:00 PM',
      jurisdiction: 'Courts at Gautam Buddh Nagar, Uttar Pradesh',
      tagline: 'Made-in-India tactical & adventure gear',
    },
  },
  grievanceOfficer: {
    isPublic: true,
    requiresReview: true,
    reviewNote: 'Grievance Officer name, designation, phone and email are mandatory under the Consumer Protection (E-Commerce) Rules 2020 and were not supplied.',
    value: { name: '', designation: '', phone: '', email: '', acknowledgeHours: 48, resolveDays: 30 },
  },
  announcement: {
    isPublic: true,
    value: { isActive: true, text: 'All prices are inclusive of GST. Packaging and delivery charges are shown before you pay.', href: '/pages/shipping-policy' },
  },
  checkout: {
    isPublic: true,
    requiresReview: true,
    reviewNote: 'Fix plan recommends building the packaging charge into product prices. Current mode shows it separately on product page, cart and checkout.',
    value: {
      guestCheckout: true,
      packagingMode: 'per_line', // included | per_unit | per_line | per_order_max
      codEnabled: true,
      codFee: 0, // fixed cash-on-delivery fee (paise, incl. GST) shown as its own line
      codAddCourierCharge: true, // add the courier's COD handling charge quoted by Shiprocket
      codMinOrderValue: 0, // paise; 0 = no minimum
      codMaxOrderValue: 0, // paise; 0 = no limit
      codGuestAllowed: true,
      codMaxOpenOrders: 3, // unfulfilled COD orders allowed per email/phone at a time
      ageConfirmationText: 'I confirm I am 18 years or older and will use this product lawfully.',
      orderNotesEnabled: true,
    },
  },
  shipping: {
    isPublic: true,
    requiresReview: true,
    reviewNote:
      'Free delivery above ₹5,000 is referenced in the fix plan; confirm it. Product weights in the spreadsheet are #REF!, so a fallback item weight is used for the weight-slab rate card until weights are entered.',
    value: { freeShippingEnabled: true, freeShippingThreshold: 500000, internationalMode: 'quote_only', defaultItemWeightKg: 1 },
  },
  shiprocket: {
    isPublic: false,
    requiresReview: true,
    reviewNote: 'Enter the pickup PIN code and the pickup location name exactly as it appears in Shiprocket → Settings → Pickup Addresses, then confirm.',
    value: {
      ratesEnabled: true, // delivery charge at checkout = Shiprocket's live rate for the PIN code
      courierChoice: 'cheapest_and_fastest', // cheapest | recommended | cheapest_and_fastest
      showCourierName: true,
      addGstToRate: false, // turn on only if your Shiprocket invoice adds 18% GST on top of the quoted rate
      handlingCharge: 0, // paise added to every Shiprocket rate (0 = show Shiprocket's charge exactly)
      fallbackToManualRates: true, // use the manual zones/rates if Shiprocket is unreachable
      autoPush: true, // create the order in Shiprocket as soon as payment is captured
      autoAssignCourier: false, // also assign the courier the customer chose (debits your Shiprocket wallet)
      pickupLocation: 'Primary',
      pickupPincode: '',
      channelId: '',
      lengthCm: 30,
      breadthCm: 25,
      heightCm: 15,
    },
  },
  seo: {
    isPublic: true,
    value: {
      homeTitle: 'DareDevil Gears | Made-in-India Tactical & Adventure Gear',
      homeDescription: 'Tactical bags, camping equipment, lighting, eyewear, footwear and field accessories from DareDevil Gears. GST-inclusive prices and transparent delivery charges.',
      ogImage: '',
    },
  },
  analytics: { isPublic: true, value: { ga4Id: '', gscVerification: '' } },
  social: { isPublic: true, value: { instagram: '', facebook: '', youtube: '', linkedin: '', twitter: '', whatsappChannel: '', googleBusiness: '' } },
  notifications: {
    value: {
      adminEmails: [],
      notifyOnNewOrder: true,
      notifyOnReturn: true,
      notifyOnGrievance: true,
      notifyOnLowStock: true,
    },
  },
  reviews: { isPublic: true, value: { enabled: true, requireVerifiedPurchase: true, autoApprove: false } },
};

const cache = new Map();
const TTL_MS = 30_000;

async function get(key) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const doc = await SiteSetting.findOne({ key }).lean();
  const value = doc ? { ...(DEFAULTS[key]?.value || {}), ...(doc.value || {}) } : DEFAULTS[key]?.value;
  cache.set(key, { value, exp: Date.now() + TTL_MS });
  return value;
}

async function getMany(keys) {
  const out = {};
  for (const k of keys) out[k] = await get(k);
  return out;
}

async function set(key, value, { updatedBy, requiresReview } = {}) {
  const doc = await SiteSetting.findOneAndUpdate(
    { key },
    {
      $set: {
        value,
        updatedBy,
        isPublic: DEFAULTS[key]?.isPublic ?? false,
        ...(requiresReview !== undefined ? { requiresReview } : {}),
      },
    },
    { upsert: true, new: true }
  );
  cache.delete(key);
  return doc;
}

async function publicSettings() {
  const keys = Object.keys(DEFAULTS).filter((k) => DEFAULTS[k].isPublic);
  return getMany(keys);
}

async function ensureDefaults() {
  for (const [key, def] of Object.entries(DEFAULTS)) {
    await SiteSetting.updateOne(
      { key },
      { $setOnInsert: { key, value: def.value, isPublic: !!def.isPublic, requiresReview: !!def.requiresReview, reviewNote: def.reviewNote } },
      { upsert: true }
    );
  }
}

function clearCache() {
  cache.clear();
}

module.exports = { DEFAULTS, get, getMany, set, publicSettings, ensureDefaults, clearCache };
