'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useCartMutation } from '@/lib/hooks';
import { inr } from '@/lib/format';

export default function CouponForm({ coupon }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const apply = useCartMutation((c) => api('/cart/coupon', { method: 'POST', body: { code: c } }), { onSuccessMessage: 'Coupon applied' });
  const remove = useCartMutation(() => api('/cart/coupon', { method: 'DELETE' }));

  if (coupon) {
    return (
      <div className="flex items-center justify-between rounded border border-okay/30 bg-white px-3 py-2 text-sm">
        <span>
          <strong>{coupon.code}</strong> applied, saving <span className="tabular">{inr(coupon.discount)}</span>
        </span>
        <button type="button" onClick={() => remove.mutate()} className="inline-flex items-center gap-1 text-graphite hover:text-alert" aria-label={`Remove coupon ${coupon.code}`}>
          <X size={15} /> Remove
        </button>
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        apply.mutate(code.trim(), { onError: (err) => setError(err.message), onSuccess: () => setCode('') });
      }}
    >
      <label htmlFor="coupon" className="field-label">
        Coupon code
      </label>
      <div className="flex gap-2">
        <input id="coupon" className="input h-10 uppercase" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" aria-invalid={Boolean(error)} aria-describedby={error ? 'coupon-err' : undefined} />
        <button type="submit" className="btn-outline btn-sm h-10" disabled={!code.trim() || apply.isPending}>
          Apply
        </button>
      </div>
      {error ? (
        <p id="coupon-err" className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
