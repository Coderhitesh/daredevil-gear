'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';
import { useUi } from '@/lib/store';

export default function ReturnForm({ order, onDone }) {
  const notify = useUi((s) => s.notify);
  const eligible = order.items.filter((i) => order.returnableItemIds.includes(i.id));
  const [type, setType] = useState('return');
  const [qty, setQty] = useState(Object.fromEntries(eligible.map((i) => [i.id, 0])));
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const upload = async (files) => {
    for (const f of [...files].slice(0, 6 - photos.length)) {
      const fd = new FormData();
      fd.append('file', f);
      try {
        const res = await api('/uploads/return-photo', { method: 'POST', body: fd });
        setPhotos((p) => [...p, res]);
      } catch (err) {
        setError(err.message);
      }
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const items = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([orderItem, quantity]) => ({ orderItem, quantity }));
    if (!items.length) return setError('Choose at least one item');
    setBusy(true);
    setError('');
    try {
      const res = await api(`/orders/${order.orderNumber}/returns`, { method: 'POST', body: { type, items, reason, description: description || undefined, photos } });
      notify(`Return request ${res.requestNumber} received. We will reply within 2 working days.`, 'good');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return null;
  };

  return (
    <form onSubmit={submit} className="panel space-y-5 p-5">
      <h3 className="font-display text-xl">Return or report a problem</h3>
      <fieldset className="space-y-2">
        <legend className="field-label">What happened?</legend>
        {[
          ['return', 'I want to return an unused item (within 7 days of delivery)'],
          ['exchange', 'I need a different size (free once per order, subject to stock)'],
          ['damaged_or_wrong', 'The item arrived damaged, defective or wrong (within 48 hours)'],
        ].map(([v, l]) => (
          <label key={v} className="flex items-start gap-2 text-[15px]">
            <input type="radio" name="rtype" className="mt-1 accent-signal" checked={type === v} onChange={() => setType(v)} /> {l}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend className="field-label">Items</legend>
        <ul className="space-y-2">
          {eligible.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 text-[15px]">
              <span>{i.name}</span>
              <select className="input h-9 w-20 py-1" aria-label={`Quantity of ${i.name} to return`} value={qty[i.id]} onChange={(e) => setQty({ ...qty, [i.id]: Number(e.target.value) })}>
                {Array.from({ length: i.quantity - i.quantityReturned - i.quantityRefunded + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </fieldset>
      <div>
        <label className="field-label" htmlFor="ret-reason">Reason</label>
        <input id="ret-reason" className="input" required minLength={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div>
        <label className="field-label" htmlFor="ret-desc">Details (optional)</label>
        <textarea id="ret-desc" className="input min-h-[90px]" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label className="field-label" htmlFor="ret-photos">Photos{type === 'damaged_or_wrong' ? ' (please include the unboxing)' : ' (optional)'}</label>
        <input id="ret-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => upload(e.target.files)} className="text-sm" />
        {photos.length ? <p className="mt-1 text-sm text-okay">{photos.length} photo(s) attached</p> : null}
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn-dark" disabled={busy || reason.length < 3}>
        Submit request
      </button>
    </form>
  );
}
