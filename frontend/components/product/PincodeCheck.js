'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { api } from '@/lib/api-client';
import { inr, deliveryEta } from '@/lib/format';

/** Serviceability check. A delivery time is shown only when one is configured for the matching rate. */
export default function PincodeCheck({ slug }) {
  const [pin, setPin] = useState('');
  const [state, setState] = useState({ status: 'idle' });

  const check = async (e) => {
    e.preventDefault();
    if (!/^[1-9]\d{5}$/.test(pin)) {
      setState({ status: 'error', message: 'Enter a valid 6-digit PIN code' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const r = await api(`/products/${slug}/delivery?pincode=${pin}`);
      setState({ status: 'done', r });
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  return (
    <form onSubmit={check} className="rounded border border-stone-300 bg-white p-4">
      <label htmlFor="pin" className="flex items-center gap-2 text-sm font-medium">
        <MapPin size={16} /> Check delivery to your PIN code
      </label>
      <div className="mt-2 flex gap-2">
        <input id="pin" inputMode="numeric" maxLength={6} autoComplete="postal-code" className="input h-10" placeholder="e.g. 201310" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} aria-describedby="pin-result" />
        <button type="submit" className="btn-outline btn-sm h-10" disabled={state.status === 'loading'}>
          Check
        </button>
      </div>
      <p id="pin-result" role="status" className="mt-2 text-sm">
        {state.status === 'error' ? <span className="text-alert">{state.message}</span> : null}
        {state.status === 'done' && !state.r.serviceable ? <span className="text-alert">{state.r.message}</span> : null}
        {state.status === 'done' && state.r.serviceable ? (
          <span className="text-okay">
            We deliver to {pin}. {state.r.free ? 'Delivery is free for this item.' : `Delivery for this item alone: ${inr(state.r.charge)}.`}
            {deliveryEta(state.r) ? ` ${deliveryEta(state.r)}.` : ''}
            {state.r.freeAbove && !state.r.free ? ` Free on orders over ${inr(state.r.freeAbove)}.` : ''}
          </span>
        ) : null}
      </p>
    </form>
  );
}
