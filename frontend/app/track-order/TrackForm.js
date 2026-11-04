'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Field from '@/components/forms/Field';
import StatusBadge from '@/components/ui/StatusBadge';
import { api } from '@/lib/api-client';
import { dateTime } from '@/lib/format';

export default function TrackForm() {
  const params = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(params.get('order') || '');
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    try {
      setResult(await api('/orders/track', { method: 'POST', body: { orderNumber: orderNumber.trim(), email: email.trim() } }));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="mt-8 space-y-8">
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <Field label="Order number" placeholder="DDG2610270001" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} required />
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button type="submit" className="btn-primary h-11">
          Track
        </button>
      </form>
      {error ? (
        <p className="text-alert" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="panel p-5" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-2xl">{result.orderNumber}</p>
            <StatusBadge status={result.status} label={result.statusLabel} />
          </div>
          {result.shipment ? (
            <p className="mt-3 text-graphite">
              {result.shipment.carrier}, tracking {result.shipment.trackingNumber}{' '}
              {result.shipment.trackingUrl ? (
                <a className="link" href={result.shipment.trackingUrl} target="_blank" rel="noopener noreferrer">
                  Track on carrier site
                </a>
              ) : null}
            </p>
          ) : null}
          <ol className="mt-5 space-y-2 border-l-2 border-stone-300 pl-5">
            {[...result.history].reverse().map((h, i) => (
              <li key={i} className="text-[15px]">
                <span className="font-medium">{h.label}</span> <span className="text-graphite-400">{dateTime(h.at)}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
