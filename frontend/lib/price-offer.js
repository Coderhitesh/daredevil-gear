/**
 * Friendly price-offer links for banners, e.g.
 *   /shop?under=999   → everything up to ₹999
 *   /shop?price=999   → only products selling at exactly ₹999
 * Values are whole rupees. They are turned into the API's minPrice/maxPrice (paise) filters.
 */

const one = (v) => (Array.isArray(v) ? v[0] : v);

function rupees(v) {
  const n = Number(String(one(v) ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 && n <= 10_000_000 ? Math.round(n) : null;
}

/** Reads ?under / ?price from searchParams (object or URLSearchParams). */
export function priceOffer(searchParams = {}) {
  const get = (k) => (typeof searchParams.get === 'function' ? searchParams.get(k) : searchParams[k]);
  const exact = rupees(get('price'));
  if (exact) return { type: 'exact', rupees: exact, minPrice: exact * 100, maxPrice: exact * 100 };
  const under = rupees(get('under'));
  if (under) return { type: 'under', rupees: under, minPrice: null, maxPrice: under * 100 };
  return null;
}

export function priceOfferLabel(offer) {
  if (!offer) return '';
  const r = `₹${offer.rupees.toLocaleString('en-IN')}`;
  return offer.type === 'exact' ? `${r} store` : `Under ${r}`;
}
