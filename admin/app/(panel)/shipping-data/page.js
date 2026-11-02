'use client';

import { useRef, useState } from 'react';
import { Download, Upload, Check } from 'lucide-react';
import { api, download } from '@/lib/api';
import { useAction, useCan, useList, useUrlState } from '@/lib/hooks';
import { PageHeader, Card, Notice, Toolbar, SearchInput, Pager, Pill, Spinner, Empty } from '@/components/ui';
import Guard from '@/components/shell/Guard';

const n = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const volumetric = (d) => (d.l > 0 && d.w > 0 && d.h > 0 ? (d.l * d.w * d.h) / 5000 : null);

/** One editable row: product weight + packed size, and weight per extra option. */
function Row({ p, writable }) {
  const [v, setV] = useState({ weightKg: p.weightKg ?? '', l: p.dimensionsCm?.l ?? '', w: p.dimensionsCm?.w ?? '', h: p.dimensionsCm?.h ?? '', variants: Object.fromEntries(p.variants.filter((x) => !x.isDefault).map((x) => [x.id, x.weightKg ?? ''])) });
  const [saved, setSaved] = useState(false);
  const dirty =
    String(v.weightKg) !== String(p.weightKg ?? '') ||
    String(v.l) !== String(p.dimensionsCm?.l ?? '') ||
    String(v.w) !== String(p.dimensionsCm?.w ?? '') ||
    String(v.h) !== String(p.dimensionsCm?.h ?? '') ||
    p.variants.some((x) => !x.isDefault && String(v.variants[x.id]) !== String(x.weightKg ?? ''));
  const save = useAction(
    () =>
      api(`/shipping-data/${p._id}`, {
        method: 'PATCH',
        body: { weightKg: n(v.weightKg), dimensionsCm: { l: n(v.l), w: n(v.w), h: n(v.h) }, variants: p.variants.filter((x) => !x.isDefault).map((x) => ({ id: x.id, weightKg: n(v.variants[x.id]) })) },
      }),
    { invalidate: ['/shipping-data'], onSuccess: () => (setSaved(true), setTimeout(() => setSaved(false), 1500)) }
  );
  const vol = volumetric({ l: n(v.l), w: n(v.w), h: n(v.h) });
  const actual = n(v.weightKg);
  const billable = vol != null && actual != null ? Math.max(vol, actual) : null;
  const input = (key, label, step = '0.1') => (
    <input
      type="number"
      min={0}
      max={500}
      step={step}
      inputMode="decimal"
      className={`input h-9 w-20 text-right ${v[key] === '' ? 'border-caution/60 bg-caution-light/40' : ''}`}
      value={v[key]}
      disabled={!writable}
      onChange={(e) => setV({ ...v, [key]: e.target.value })}
      aria-label={`${label} for ${p.name}`}
    />
  );
  return (
    <tr>
      <td className="max-w-[18rem]">
        <span className="block truncate font-medium">{p.name}</span>
        <span className="text-xs text-graphite-400">
          {p.sku}
          {p.category ? ` · ${p.category}` : ''}
        </span>
        {p.variants.filter((x) => !x.isDefault).length ? (
          <div className="mt-2 space-y-1">
            {p.variants
              .filter((x) => !x.isDefault)
              .map((x) => (
                <label key={x.id} className="flex items-center gap-2 text-xs text-graphite-600">
                  <span className="w-32 truncate">{x.title}</span>
                  <input type="number" min={0} step="0.01" className="input h-8 w-20 text-right" value={v.variants[x.id]} disabled={!writable} placeholder="same" onChange={(e) => setV({ ...v, variants: { ...v.variants, [x.id]: e.target.value } })} aria-label={`Weight of ${x.title}`} />
                  kg
                </label>
              ))}
          </div>
        ) : null}
      </td>
      <td className="text-right">{input('weightKg', 'Weight (kg)', '0.01')}</td>
      <td className="text-right">{input('l', 'Length (cm)')}</td>
      <td className="text-right">{input('w', 'Width (cm)')}</td>
      <td className="text-right">{input('h', 'Height (cm)')}</td>
      <td className="text-right text-xs tabular-nums text-graphite-600">
        {vol != null ? `${vol.toFixed(2)} kg` : '—'}
        {billable != null ? <span className="block font-semibold text-ink">bills {billable.toFixed(2)} kg</span> : null}
      </td>
      <td className="text-right">
        {writable ? (
          <button type="button" className={dirty ? 'btn-primary btn-xs' : 'btn-ghost btn-xs'} disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Spinner className="h-3.5 w-3.5" /> : saved ? <Check className="h-3.5 w-3.5" /> : null} {saved ? 'Saved' : 'Save'}
          </button>
        ) : null}
      </td>
    </tr>
  );
}

export default function ShippingDataPage() {
  const can = useCan();
  const writable = can('products:write');
  const [state, set] = useUrlState({ missing: '1' });
  const list = useList('/shipping-data', { ...state, limit: 50 });
  const fileRef = useRef(null);
  const [report, setReport] = useState(null);
  const importCsv = useAction((csv) => api('/shipping-data/import', { method: 'POST', body: { csv } }), {
    invalidate: ['/shipping-data'],
    onSuccess: (r) => setReport(r),
    success: (r) => `Updated ${r.updated} products${r.variantsUpdated ? ` and ${r.variantsUpdated} options` : ''}`,
  });
  const counts = list.meta?.counts;

  return (
    <Guard perm="products:read">
      <PageHeader
        title="Weights & sizes"
        description="Delivery charges come from Shiprocket, which bills the higher of the actual weight and the volumetric weight (length × width × height ÷ 5000). Enter the packed weight and box size of each product."
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-outline" onClick={() => download('/shipping-data/export', 'shipping-data.csv')}>
              <Download className="h-4 w-4" /> Download CSV
            </button>
            {writable ? (
              <>
                <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()} disabled={importCsv.isPending}>
                  {importCsv.isPending ? <Spinner /> : <Upload className="h-4 w-4" />} Upload CSV
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) importCsv.mutate(await f.text());
                  }}
                />
              </>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 space-y-3">
        {counts ? (
          counts.missing ? (
            <Notice tone="caution" title={`${counts.missing} of ${counts.all} products are missing a weight or size`}>
              Until they are filled in, delivery is charged on the fallback weight (Settings → Shipping) and the default box (Settings → Shiprocket), which can over- or under-charge customers.
            </Notice>
          ) : (
            <Notice tone="okay">All {counts.all} products have a weight and size.</Notice>
          )
        ) : null}
        <Notice tone="info">
          Weigh and measure each product <strong>packed and ready to ship</strong> (with its box or poly-bag). For many products at once: Download CSV → fill <code>weight_kg</code>, <code>length_cm</code>, <code>width_cm</code>, <code>height_cm</code> in Excel → save as CSV → Upload. Rows with a <code>variant_sku</code> set that option&apos;s weight.
        </Notice>
        {report?.skipped?.length ? (
          <Notice tone="caution" title={`${report.skipped.length} rows skipped`}>
            <ul className="list-disc pl-5 text-sm">
              {report.skipped.slice(0, 20).map((s) => (
                <li key={`${s.line}-${s.sku}`}>
                  Line {s.line} ({s.sku || 'no SKU'}): {s.reason}
                </li>
              ))}
            </ul>
          </Notice>
        ) : null}
      </div>

      <Toolbar>
        <SearchInput value={state.q} onChange={(q) => set({ q, page: undefined })} placeholder="Search name or SKU" />
        <label>
          <span className="sr-only">Show</span>
          <select className="input w-auto pr-8" value={state.missing === '1' ? '1' : 'all'} onChange={(e) => set({ missing: e.target.value, page: undefined })}>
            <option value="1">Missing weight or size</option>
            <option value="all">All products</option>
          </select>
        </label>
        {counts ? <Pill tone={counts.missing ? 'caution' : 'okay'}>{counts.missing} missing</Pill> : null}
      </Toolbar>

      <Card bodyClass="">
        {list.isLoading ? (
          <div className="skeleton m-4 h-40" />
        ) : !list.items.length ? (
          <Empty title={state.missing === '1' ? 'Nothing missing' : 'No products'}>{state.missing === '1' ? 'Every product has a weight and size.' : null}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="text-right">Weight (kg)</th>
                  <th className="text-right">Length (cm)</th>
                  <th className="text-right">Width (cm)</th>
                  <th className="text-right">Height (cm)</th>
                  <th className="text-right">Volumetric</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.items.map((p) => (
                  <Row key={`${p._id}-${p.weightKg}-${p.dimensionsCm?.l}-${p.dimensionsCm?.w}-${p.dimensionsCm?.h}`} p={p} writable={writable} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.meta ? <Pager meta={list.meta} onPage={(page) => set({ page })} /> : null}
      </Card>
    </Guard>
  );
}
