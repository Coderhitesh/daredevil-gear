'use strict';

/**
 * Catalogue information architecture.
 *
 * The spreadsheet groups products into broad "brand" groups (Adventure Maniacs, Soldiers Accessories,
 * Warrior Men, Memsahab Corner, Engine Oil). The fix plan (item 12) asks for ONE menu with each product
 * in ONE main category. We therefore:
 *   - map every product to a single shopping department (below), by documented keyword rules;
 *   - keep the original group as `source.sourceCategory` and as a curated Collection for storytelling.
 * Department codes double as the SKU prefix (fix plan item 14: DDG-BAG-001, DDG-FTW-001, DDG-EYE-001).
 */

const DEPARTMENTS = [
  { code: 'BAG', slug: 'bags-backpacks', name: 'Bags & Backpacks', sortOrder: 1, description: 'Tactical backpacks, rucksacks, sling bags and utility pouches.' },
  { code: 'CMP', slug: 'camping-outdoor', name: 'Camping & Outdoor', sortOrder: 2, description: 'Tents, camp furniture, cookware, stoves and trekking essentials.' },
  { code: 'LGT', slug: 'torches-lighting', name: 'Torches & Lighting', sortOrder: 3, description: 'Rechargeable torches, head lamps, lanterns and emergency lights.' },
  { code: 'TLS', slug: 'tools-survival', name: 'Tools & Survival', sortOrder: 4, description: 'Multitools, entrenching tools and survival kits.' },
  { code: 'EYE', slug: 'tactical-eyewear', name: 'Tactical Eyewear', sortOrder: 5, description: 'Goggles and shooting/sports glasses with interchangeable lenses.' },
  { code: 'FTW', slug: 'footwear', name: 'Footwear', sortOrder: 6, description: 'Jungle, field and high-altitude footwear.' },
  { code: 'APP', slug: 'headwear-apparel', name: 'Headwear & Apparel', sortOrder: 7, description: 'Caps, hats, ponchos, belts and gloves.' },
  { code: 'TAC', slug: 'training-tactical-gear', name: 'Training & Tactical Gear', sortOrder: 8, description: 'Non-ballistic airsoft/training helmets and load-carrying vests. No item in this range provides ballistic protection.' },
  { code: 'SAF', slug: 'personal-safety', name: 'Personal Safety', sortOrder: 9, description: 'Personal self-defence products — 18+ only, delivery within India only.' },
  { code: 'MEM', slug: 'memsahab-corner', name: 'Memsahab Corner', sortOrder: 10, description: 'Handcrafted capes and winter layers.' },
  { code: 'VGC', slug: 'vehicle-generator-care', name: 'Vehicle & Generator Care', sortOrder: 11, description: 'Engine oils, gear oil, coolant and fuel additives for vehicles and generator sets.' },
];

/** Ordered rules: first match wins. */
const RULES = [
  { code: 'MEM', test: (p) => /memsahab/i.test(p.sourceCategory) },
  { code: 'VGC', test: (p) => /engine oil/i.test(p.sourceCategory) || p.sheet === 'Engine OIl' },
  { code: 'FTW', test: (p) => /\b(shoes?|boots?)\b/i.test(p.name) },
  { code: 'EYE', test: (p) => /\b(goggles?|glasses)\b/i.test(p.name) },
  { code: 'LGT', test: (p) => /\b(torch|flashlight|head\s*lamp|lantern|bulb|led light)\b/i.test(p.name) },
  { code: 'SAF', test: (p) => /\bpepper spray\b/i.test(p.name) },
  { code: 'TAC', test: (p) => /\b(helmet|plate carrier|stun)\b/i.test(p.name) },
  { code: 'TLS', test: (p) => /\b(multi-?tool|knife|shovel|entrenching|survival kit)\b/i.test(p.name) },
  { code: 'BAG', test: (p) => /\b(backpack|sling|bag|rucksack)\b/i.test(p.name) },
  { code: 'APP', test: (p) => /\b(cap|hat|poncho|belt|gloves)\b/i.test(p.name) },
  { code: 'CMP', test: () => true },
];

function departmentFor(p) {
  const rule = RULES.find((r) => r.test(p));
  return DEPARTMENTS.find((d) => d.code === rule.code);
}

/** Source groups kept as curated collections (fix plan typo/brand fixes applied). */
const COLLECTIONS = [
  { source: 'Adventure Maniacs', slug: 'adventure-maniacs', name: 'Adventure Maniacs', description: 'Kit for trekkers, campers and riders who head out in every season.' },
  { source: 'Warrior Men', slug: 'warrior-men', name: 'Warrior Men', description: 'Field footwear built for rough, wet and high-altitude ground.' },
  { source: 'Soldiers Accessories', slug: 'soldiers-accessories', name: "Soldiers' Accessories", description: 'Load-carrying bags, field headwear and training gear.' },
];

function brandFor(name) {
  if (/^daredevil\b/i.test(name)) return { slug: 'daredevil-gears', name: 'DareDevil Gears', isOwnBrand: true };
  if (/\bflemex\b/i.test(name)) return { slug: 'flemex', name: 'Flemex', isOwnBrand: false };
  return null;
}

/** Normalise source category spellings. */
function normaliseSourceCategory(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, ' ');
  const map = {
    'adventure maniacs': 'Adventure Maniacs',
    'soldiers accessories': 'Soldiers Accessories',
    'warrior men': 'Warrior Men',
    'memsahab corner': 'Memsahab Corner',
    'engine oil': 'Engine Oil',
  };
  return map[s.toLowerCase()] || s;
}

module.exports = { DEPARTMENTS, COLLECTIONS, departmentFor, brandFor, normaliseSourceCategory };
