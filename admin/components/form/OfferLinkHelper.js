'use client';

import { useState } from 'react';

/**
 * Fills the banner click link with a storefront price-offer listing:
 *   /shop?under=999  → products up to ₹999 (sale prices count)
 *   /shop?price=999  → only products selling at exactly ₹999
 */
export default function OfferLinkHelper({ form, field = 'linkHref' }) {
  const current = form.watch(field) || '';
  const m = /^\/shop\?(under|price)=(\d+)$/.exec(current);
  const [amount, setAmount] = useState(m ? m[2] : '');
  const n = Number(amount);
  const valid = Number.isInteger(n) && n > 0;

  const apply = (type) => {
    if (!valid) return;
    form.setValue(field, `/shop?${type}=${n}`, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <div className="rounded border border-dashed border-stone-400 p-3">
      <p className="label mb-1">Price offer link (optional shortcut)</p>
      <p className="hint mb-3">Enter the offer amount in rupees and pick how the shop page should filter. It fills the click link above.</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-graphite">₹</span>
        <input
          inputMode="numeric"
          className="input h-10 w-32"
          placeholder="999"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 7))}
          aria-label="Offer amount in rupees"
        />
        <button type="button" className="btn-outline h-10" disabled={!valid} onClick={() => apply('under')}>
          Up to ₹{valid ? n : '…'}
        </button>
        <button type="button" className="btn-outline h-10" disabled={!valid} onClick={() => apply('price')}>
          Exactly ₹{valid ? n : '…'}
        </button>
      </div>
      {m ? (
        <p className="hint mt-2">
          Current link shows {m[1] === 'price' ? 'products at exactly' : 'products up to'} ₹{m[2]}.
        </p>
      ) : null}
    </div>
  );
}
