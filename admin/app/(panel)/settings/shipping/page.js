'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { api, fieldErrors } from '@/lib/api';
import { useAction, useCan } from '@/lib/hooks';
import { inr, toPaise, toRupees } from '@/lib/format';
import { PageHeader, Card, Notice, Spinner, Status, Pill, Drawer, Input, Select, Checkbox, Textarea, Confirm, Empty } from '@/components/ui';
import Guard from '@/components/shell/Guard';

export default function ShippingPage() {
  const can = useCan();
  const writable = can('shipping:write');
  const zones = useQuery({ queryKey: ['/shipping/zones'], queryFn: () => api('/shipping/zones', { query: { limit: 200 } }).then((r) => r.data) });
  const rates = useQuery({ queryKey: ['/shipping/rates'], queryFn: () => api('/shipping/rates', { query: { limit: 200 } }).then((r) => r.data) });
  const [zone, setZone] = useState(null);
  const [rate, setRate] = useState(null);

  return (
    <Guard perm="settings:read">
      <PageHeader
        title="Shipping"
        description="Zones decide where a PIN code belongs; rates decide what delivery costs there. The customer sees the charge before paying. The free-delivery threshold is under Store settings."
        actions={
          writable ? (
            <>
              <button type="button" className="btn-outline" onClick={() => setZone({})}>
                <Plus className="h-4 w-4" /> Zone
              </button>
              <button type="button" className="btn-primary" onClick={() => setRate({})} disabled={!zones.data?.length}>
                <Plus className="h-4 w-4" /> Rate
              </button>
            </>
          ) : null
        }
      />
      {(rates.data || []).some((r) => r.requiresReview) ? (
        <div className="mb-4">
          <Notice tone="caution" title="Rates to confirm">Some rates were derived from the product sheet formula and need confirming against your courier contract.</Notice>
        </div>
      ) : null}
      {zones.isLoading ? <div className="skeleton h-40" /> : null}
      {zones.data && !zones.data.length ? <Card><Empty title="No delivery zones">Add a zone (for example “All India”) and at least one rate, or checkout cannot quote delivery.</Empty></Card> : null}
      <div className="space-y-4">
        {(zones.data || []).map((z) => {
          const zr = (rates.data || []).filter((r) => String(r.zone?._id || r.zone) === String(z._id));
          return (
            <Card
              key={z._id}
              title={
                <span className="flex items-center gap-2">
                  {z.name} <Status value={z.isActive === false ? 'archived' : 'active'} label={z.isActive === false ? 'Inactive' : 'Active'} />
                </span>
              }
              actions={writable ? <button type="button" className="btn-ghost btn-xs" onClick={() => setZone(z)}><Pencil className="h-3.5 w-3.5" /> Edit zone</button> : null}
              bodyClass=""
            >
              <p className="border-b border-stone-200 px-4 py-2 text-xs text-graphite-600">
                {z.scope === 'international' ? `Countries: ${z.countries.join(', ')}` : z.states?.length ? `States: ${z.states.join(', ')}` : z.pincodePrefixes?.length ? `PIN prefixes: ${z.pincodePrefixes.slice(0, 20).join(', ')}${z.pincodePrefixes.length > 20 ? '…' : ''}` : z.isActive === false ? 'No area defined yet. Add states or PIN prefixes before activating.' : 'All of India'}
                {z.excludedPincodes?.length ? `. ${z.excludedPincodes.length} PIN codes excluded.` : ''}
              </p>
              {zr.length ? (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Rate</th>
                      <th>Charge</th>
                      <th>Free above</th>
                      <th>Delivery time</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {zr.map((r) => (
                      <tr key={r._id}>
                        <td>
                          {r.name}
                          <span className="block text-xs text-graphite-400">{r.method}</span>
                        </td>
                        <td className="text-sm">
                          {r.type === 'flat' ? inr(r.flatCharge) : (
                            <span className="text-xs">
                              {r.slabs.map((s) => `up to ${s.maxKg} kg ${inr(s.charge)}`).join(', ')}
                              {r.beyondPerKg ? `, then ${inr(r.beyondPerKg)}/kg` : ''}
                            </span>
                          )}
                        </td>
                        <td>{r.freeAbove ? inr(r.freeAbove) : '—'}</td>
                        <td>{r.estimatedDays?.max ? `${r.estimatedDays.min}–${r.estimatedDays.max} days` : '—'}</td>
                        <td>
                          <Status value={r.isActive === false ? 'archived' : 'active'} label={r.isActive === false ? 'Inactive' : 'Active'} />
                          {r.requiresReview ? <span className="ml-1"><Pill tone="caution">Confirm</Pill></span> : null}
                        </td>
                        <td className="text-right">{writable ? <button type="button" className="btn-ghost btn-xs" onClick={() => setRate(r)} aria-label={`Edit ${r.name}`}><Pencil className="h-3.5 w-3.5" /></button> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-4 py-3 text-sm text-graphite-400">No rates in this zone.</p>
              )}
            </Card>
          );
        })}
      </div>
      {zone ? <ZoneDrawer zone={zone} onClose={() => setZone(null)} /> : null}
      {rate ? <RateDrawer rate={rate} zones={zones.data || []} onClose={() => setRate(null)} /> : null}
    </Guard>
  );
}

const csv = (a) => (a || []).join(', ');
const split = (s) => String(s || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

function ZoneDrawer({ zone, onClose }) {
  const isNew = !zone._id;
  const [v, setV] = useState({ name: zone.name || '', scope: zone.scope || 'domestic', countries: csv(zone.countries || ['IN']), states: csv(zone.states), pincodePrefixes: csv(zone.pincodePrefixes), excludedPincodes: csv(zone.excludedPincodes), isActive: zone.isActive ?? true, sortOrder: zone.sortOrder ?? 0 });
  const [confirm, setConfirm] = useState(false);
  const up = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const body = () => ({ name: v.name.trim(), scope: v.scope, countries: split(v.countries).map((c) => c.toUpperCase()), states: v.states.split(',').map((s) => s.trim()).filter(Boolean), pincodePrefixes: split(v.pincodePrefixes), excludedPincodes: split(v.excludedPincodes), isActive: v.isActive, sortOrder: Number(v.sortOrder) || 0 });
  const save = useAction(() => (isNew ? api('/shipping/zones', { method: 'POST', body: body() }) : api(`/shipping/zones/${zone._id}`, { method: 'PATCH', body: body() })), { invalidate: ['/shipping/zones'], success: 'Zone saved', onSuccess: onClose });
  const remove = useAction(() => api(`/shipping/zones/${zone._id}`, { method: 'DELETE' }), { invalidate: ['/shipping/zones'], success: 'Zone deleted', onSuccess: onClose });
  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? 'New zone' : `Edit ${zone.name}`}
      footer={
        <>
          {!isNew ? <button type="button" className="btn-danger mr-auto" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" /> Delete</button> : null}
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={v.name.trim().length < 2 || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Spinner /> : null} Save zone</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Zone name" required value={v.name} onChange={up('name')} />
        <Select label="Scope" value={v.scope} onChange={up('scope')} options={[['domestic', 'India'], ['international', 'International']]} />
        {v.scope === 'international' ? <Input label="Country codes" className="sm:col-span-2" value={v.countries} onChange={up('countries')} hint="ISO codes, comma separated (US, GB, AE)" /> : (
          <>
            <Textarea label="States" className="sm:col-span-2" rows={2} value={v.states} onChange={up('states')} hint="Comma separated full names. Leave empty with no PIN prefixes for all of India." />
            <Textarea label="PIN code prefixes" className="sm:col-span-2" rows={2} value={v.pincodePrefixes} onChange={up('pincodePrefixes')} hint="e.g. 201, 110 — a PIN matches the longest prefix" />
            <Textarea label="Excluded PIN codes (not serviceable)" className="sm:col-span-2" rows={2} value={v.excludedPincodes} onChange={up('excludedPincodes')} />
          </>
        )}
        <Input label="Priority" type="number" value={v.sortOrder} onChange={up('sortOrder')} hint="Lower is checked first" />
        <Checkbox label="Active" checked={v.isActive} onChange={up('isActive')} className="self-end pb-2" />
      </div>
      <Confirm open={confirm} onClose={() => setConfirm(false)} title="Delete this zone?" tone="danger" confirmLabel="Delete" busy={remove.isPending} onConfirm={() => remove.mutate()}>
        <p>Delete its rates first. Past orders keep their delivery charge.</p>
      </Confirm>
    </Drawer>
  );
}

function RateDrawer({ rate, zones, onClose }) {
  const isNew = !rate._id;
  const [v, setV] = useState({
    zone: String(rate.zone?._id || rate.zone || zones[0]?._id || ''),
    name: rate.name || 'Standard delivery',
    method: rate.method || 'standard',
    type: rate.type || 'flat',
    flatCharge: toRupees(rate.flatCharge ?? 0),
    slabs: (rate.slabs || []).map((s) => ({ maxKg: String(s.maxKg), charge: toRupees(s.charge) })),
    beyondPerKg: toRupees(rate.beyondPerKg ?? 0),
    freeAbove: toRupees(rate.freeAbove),
    minDays: rate.estimatedDays?.min ?? '',
    maxDays: rate.estimatedDays?.max ?? '',
    isActive: rate.isActive ?? true,
    requiresReview: rate.requiresReview ?? false,
    reviewNote: rate.reviewNote || '',
  });
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(false);
  const up = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const body = () => ({
    zone: v.zone,
    name: v.name.trim(),
    method: v.method,
    type: v.type,
    flatCharge: toPaise(v.flatCharge) || 0,
    slabs: v.type === 'weight_slab' ? v.slabs.filter((s) => s.maxKg !== '').map((s) => ({ maxKg: Number(s.maxKg), charge: toPaise(s.charge) || 0 })).sort((a, b) => a.maxKg - b.maxKg) : [],
    beyondPerKg: toPaise(v.beyondPerKg) || 0,
    freeAbove: v.freeAbove === '' ? null : toPaise(v.freeAbove),
    estimatedDays: { min: v.minDays === '' ? undefined : Number(v.minDays), max: v.maxDays === '' ? undefined : Number(v.maxDays) },
    isActive: v.isActive,
    requiresReview: v.requiresReview,
    reviewNote: v.reviewNote.trim() || undefined,
  });
  const save = useAction(() => (isNew ? api('/shipping/rates', { method: 'POST', body: body() }) : api(`/shipping/rates/${rate._id}`, { method: 'PATCH', body: body() })), {
    invalidate: ['/shipping/rates'],
    success: 'Rate saved',
    onSuccess: onClose,
    onError: (err) => (setErrors(fieldErrors(err)), false),
  });
  const remove = useAction(() => api(`/shipping/rates/${rate._id}`, { method: 'DELETE' }), { invalidate: ['/shipping/rates'], success: 'Rate deleted', onSuccess: onClose });
  const setSlab = (i, k, val) => setV({ ...v, slabs: v.slabs.map((s, j) => (j === i ? { ...s, [k]: val } : s)) });

  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? 'New rate' : `Edit ${rate.name}`}
      footer={
        <>
          {!isNew ? <button type="button" className="btn-danger mr-auto" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" /> Delete</button> : null}
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!v.zone || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Spinner /> : null} Save rate</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Zone" value={v.zone} onChange={up('zone')} options={zones.map((z) => [String(z._id), z.name])} />
        <Input label="Name shown at checkout" value={v.name} onChange={up('name')} error={errors.name} />
        <Select label="Service" value={v.method} onChange={up('method')} options={[['standard', 'Standard'], ['express', 'Express'], ['india_post', 'India Post']]} />
        <Select label="Charge type" value={v.type} onChange={up('type')} options={[['flat', 'Flat charge per order'], ['weight_slab', 'By total weight']]} />
        {v.type === 'flat' ? (
          <Input label="Charge (₹, incl. GST)" inputMode="decimal" value={v.flatCharge} onChange={up('flatCharge')} />
        ) : (
          <div className="sm:col-span-2">
            <p className="label">Weight slabs (₹, incl. GST)</p>
            <div className="space-y-2">
              {v.slabs.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm text-graphite-600">Up to</span>
                  <input className="input w-24" inputMode="decimal" value={s.maxKg} onChange={(e) => setSlab(i, 'maxKg', e.target.value)} aria-label="Max kg" />
                  <span className="text-sm text-graphite-600">kg costs ₹</span>
                  <input className="input w-28" inputMode="decimal" value={s.charge} onChange={(e) => setSlab(i, 'charge', e.target.value)} aria-label="Charge" />
                  <button type="button" className="btn-ghost btn-xs text-alert" onClick={() => setV({ ...v, slabs: v.slabs.filter((_, j) => j !== i) })} aria-label="Remove slab"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" className="btn-outline btn-xs" onClick={() => setV({ ...v, slabs: [...v.slabs, { maxKg: '', charge: '' }] })}><Plus className="h-3.5 w-3.5" /> Add slab</button>
            </div>
            <Input className="mt-3 max-w-xs" label="Each extra kg above the last slab (₹)" inputMode="decimal" value={v.beyondPerKg} onChange={up('beyondPerKg')} />
          </div>
        )}
        <Input label="Free above (₹)" inputMode="decimal" value={v.freeAbove} onChange={up('freeAbove')} hint="Optional. Overrides the store-wide threshold for this rate." />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Min days" type="number" value={v.minDays} onChange={up('minDays')} />
          <Input label="Max days" type="number" value={v.maxDays} onChange={up('maxDays')} />
        </div>
        <Checkbox label="Active" checked={v.isActive} onChange={up('isActive')} />
        <Checkbox label="Still needs confirming with the courier" checked={v.requiresReview} onChange={up('requiresReview')} />
        {v.requiresReview ? <Textarea label="Review note" className="sm:col-span-2" rows={2} value={v.reviewNote} onChange={up('reviewNote')} /> : null}
      </div>
      <Confirm open={confirm} onClose={() => setConfirm(false)} title="Delete this rate?" tone="danger" confirmLabel="Delete" busy={remove.isPending} onConfirm={() => remove.mutate()}>
        <p>Checkout will stop offering it straight away.</p>
      </Confirm>
    </Drawer>
  );
}
