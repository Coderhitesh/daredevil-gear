'use strict';

/**
 * Product content compliance scanner (fix plan items 3, 4, 5, 6, 13, 14).
 * Produces flags; blocking flags prevent publication until an admin edits the content
 * or records a resolution (e.g. uploads the test certificate).
 */

const BLOCKING_CLAIMS = [
  { code: 'claim_bulletproof', re: /\bbullet\s*-?\s*proof\b/gi, message: 'Bulletproof claim — not permitted without a certified ballistic rating' },
  { code: 'claim_ballistic', re: /\bballistic\b(?![\s-]*(grade[\s-]+)?nylon)/gi, message: 'Ballistic protection claim — requires a test certificate' },
  { code: 'claim_nij', re: /\bNIJ\b/g, message: 'NIJ rating referenced — requires a test certificate' },
  { code: 'claim_kevlar', re: /\bkevlar\b/gi, message: 'Kevlar referenced — third-party trademark / unsubstantiated material claim' },
  { code: 'claim_mil_std', re: /\bMIL-(STD|PRF)[-\s]?\d*/g, message: 'Military standard referenced — requires a test report' },
  { code: 'claim_safety_standard', re: /\b(ANSI\s*Z?87(\.1)?\+?|Z87|EN\s?166)\b/gi, message: 'Safety standard claimed — show only with the test report on file' },
  { code: 'claim_military_grade', re: /\bmilitary[\s-]grade\b/gi, message: '"Military-grade" claim is unsubstantiated' },
  { code: 'claim_endorsement', re: /\b(trusted by [^.]{0,60}(units?|professionals|forces)|tested in (the )?toughest)/gi, message: 'Endorsement/testing claim without a named user or test' },
  { code: 'claim_meets_standards', re: /\b(designed|built|engineered) to meet [^.]{0,60}standards?\b|\bexceeds? international standards\b|\b(fully )?certified\b/gi, message: 'Standards/certification claim — requires evidence' },
  { code: 'claim_life_saving', re: /\blife[\s-]?saving\b/gi, message: 'Life-saving claim' },
];

const WARNING_CLAIMS = [
  { code: 'ballistic_fabric_wording', re: /\bballistic[\s-]*(grade[\s-]+)?nylon\b/gi, message: '"Ballistic nylon" is a fabric name — consider "1000D nylon" to avoid implying protection' },
  { code: 'origin_claim', re: /\b(zero chinese components?|no chinese components|100% indian[\s-]made|made in india)\b/gi, message: 'Country-of-origin claim — confirm and fill the Country of Origin field' },
  { code: 'worldwide_shipping_claim', re: /\b(global delivery|ships? (across the )?world|worldwide (delivery|shipping))\b/gi, message: 'Mentions worldwide delivery — conflicts with India-only shipping policy for restricted items' },
  { code: 'performance_claim', re: /\b(unmatched|superior|ultimate|next-gen(eration)?|exceptional(ly)?)\b/gi, message: 'Superlative performance wording — make sure it can be substantiated' },
  { code: 'third_party_brand', re: /\b(zapp|SOG|BRS|ocumax|YKK|harpy)\b/gi, message: 'Third-party brand name — keep only with authorised-distributor proof' },
  { code: 'third_party_company', re: /\banuvyom\b/gi, message: 'Mentions a different company name — confirm manufacturer/brand naming' },
];

const PLACEHOLDER = /\b(TO ADD|TBD|CONFIRM)\b|\(confirm[^)]*\)|\bconfirm (with|per|red|lumens|mah|type-c|number|ipx|one size|midsole)\b|-\s*confirm\b|\bconfirm\b\s*$/i;
const INTERNAL_NOTE = /\b(only when|only with|only if)\b[^.]{0,80}\b(on file|genuine|report|certificate)\b|^\s*state\s+['"A-Z]/i;

const RESTRICTED_RULES = [
  { re: /\bpepper\s*spray\b/i, apply: { minAge: 18, domesticOnly: true, dangerousGoods: true, returnable: false }, code: 'restricted_pepper_spray', message: 'Pepper spray: 18+, India-only, dangerous goods (aerosol), non-returnable' },
  { re: /\b(folding knife|pocket knife|multi-?tool[^,]{0,20}knife|knife)\b/i, apply: { minAge: 18, domesticOnly: true }, code: 'restricted_knife', message: 'Knife: 18+ and India-only delivery' },
  { re: /\bstun\b/i, apply: { minAge: 18, domesticOnly: true, legalReview: true }, code: 'restricted_stun', message: 'Stun device — legal review required before any sale', blocking: true },
  { re: /\b(BSF|CISF|CRPF|ITBP|SSB|central police)\b/i, apply: { legalReview: true }, code: 'force_insignia', message: 'Force-insignia uniform item — removed pending legal advice', blocking: true },
  { re: /\brestricted sale\b/i, apply: { legalReview: true }, code: 'restricted_sale_label', message: 'Marked "Restricted Sale" in source data — legal review required', blocking: true },
  { re: /\bengine oil|motor oil|gear oil|coolant|diesel additive\b/i, apply: { returnableOpenedNote: true }, code: 'lubricant', message: 'Lubricant: opened oils are non-returnable per draft policy' },
];

function isNegated(text, index) {
  const before = text.slice(Math.max(0, index - 45), index).toLowerCase();
  if (/\b(non|not|no|never|without)\b[\s-]*(\w+[\s,\-/]+){0,5}$/.test(before)) return true;
  if (/non-$/.test(before)) return true;
  const sentenceStart = text.lastIndexOf('.', index);
  const sentence = text.slice(sentenceStart + 1, text.indexOf('.', index) === -1 ? undefined : text.indexOf('.', index) + 1);
  if (/\b(only when|only with|only if)\b/i.test(sentence)) return true;
  return false;
}

function scanText(text, field) {
  const flags = [];
  if (!text) return flags;
  for (const rule of BLOCKING_CLAIMS) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text))) {
      if (!isNegated(text, m.index)) {
        flags.push({ code: rule.code, severity: 'blocking', message: rule.message, field, evidence: excerpt(text, m.index) });
        break;
      }
    }
  }
  for (const rule of WARNING_CLAIMS) {
    rule.re.lastIndex = 0;
    const m = rule.re.exec(text);
    if (m) flags.push({ code: rule.code, severity: 'warning', message: rule.message, field, evidence: excerpt(text, m.index) });
  }
  return flags;
}

function excerpt(text, index) {
  return text.slice(Math.max(0, index - 40), index + 60).replace(/\s+/g, ' ').trim();
}

/** Spec lines that are internal notes or unfilled placeholders are hidden from the storefront. */
function classifySpec(spec) {
  const text = `${spec.label || ''}: ${spec.value || ''}`;
  if (INTERNAL_NOTE.test(spec.value || '') || INTERNAL_NOTE.test(text)) return { isPublic: false, note: 'internal_note' };
  if (PLACEHOLDER.test(spec.value || '') || PLACEHOLDER.test(spec.label || '')) return { isPublic: false, note: 'placeholder' };
  return { isPublic: true };
}

/**
 * Scan a product-like object. Returns { flags, restrictions }.
 * restrictions: suggested compliance settings derived from the product type.
 */
function scanProduct(p) {
  const flags = [];
  flags.push(...scanText(p.name, 'name'));
  flags.push(...scanText(p.description, 'description'));
  flags.push(...scanText(p.shortDescription, 'shortDescription'));
  (p.features || []).forEach((f, i) => flags.push(...scanText(f, `features.${i}`)));
  (p.specifications || []).forEach((s, i) => {
    if (s.isPublic === false) return; // hidden lines are not customer-facing
    flags.push(...scanText(`${s.label}: ${s.value}`, `specifications.${i}`));
  });

  const hidden = (p.specifications || []).filter((s) => s.isPublic === false);
  if (hidden.length) {
    flags.push({
      code: 'spec_incomplete',
      severity: 'warning',
      message: `${hidden.length} specification line(s) hidden from customers (placeholder or internal note) — complete them in the admin`,
      field: 'specifications',
      evidence: hidden.map((s) => `${s.label}: ${s.value}`).join(' | ').slice(0, 300),
    });
  }

  const restrictions = { minAge: 0, domesticOnly: false, dangerousGoods: false, legalReview: false, returnable: true };
  const haystack = `${p.name} ${p.description || ''}`;
  for (const rule of RESTRICTED_RULES) {
    const usesHaystack = rule.code === 'restricted_pepper_spray' || rule.code === 'restricted_knife';
    if (rule.re.test(p.name) || (usesHaystack && rule.re.test(haystack))) {
      Object.assign(restrictions, rule.apply);
      flags.push({ code: rule.code, severity: rule.blocking ? 'blocking' : 'warning', message: rule.message, field: 'name', evidence: p.name });
    }
  }

  // de-duplicate by code+field
  const seen = new Set();
  const unique = flags.filter((f) => {
    const k = `${f.code}|${f.field}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { flags: unique, restrictions };
}

/** Statutory (Legal Metrology) fields that should be filled before launch. */
function statutoryWarnings(p) {
  const c = p.compliance || {};
  const missing = [];
  if (!c.countryOfOrigin) missing.push('Country of origin');
  if (!c.manufacturer?.name && !c.importer?.name && !c.packer?.name) missing.push('Manufacturer / packer / importer name & address');
  if (!c.netQuantity) missing.push('Net quantity');
  if (!c.consumerCare) missing.push('Consumer-care contact');
  if (!p.hsnCode) missing.push('HSN code');
  return missing;
}

/** Can this product be published? Returns list of blocking reasons (empty = OK). */
function publishBlockers(p, { categoryActive = true } = {}) {
  const reasons = [];
  const openBlocking = (p.flags || []).filter((f) => f.severity === 'blocking' && !f.resolvedAt);
  for (const f of openBlocking) reasons.push(f.message);
  const lr = p.compliance?.legalReview;
  if (lr?.required && lr.status !== 'approved') reasons.push('Legal review not approved');
  if (!(p.pricing?.priceInclusive > 0)) reasons.push('Price is missing');
  if (!p.category) reasons.push('Category is missing');
  if (!categoryActive) reasons.push('Category is disabled');
  return reasons;
}

module.exports = { scanText, scanProduct, classifySpec, statutoryWarnings, publishBlockers, isNegated };
