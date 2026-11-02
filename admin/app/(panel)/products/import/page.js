'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Play, ShieldAlert, ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTime, humanize } from '@/lib/format';
import { PageHeader, Card, Notice, Spinner, Pill, Tabs, Empty, Confirm } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import Guard from '@/components/shell/Guard';

const SUMMARY = [
  ['totalSourceRows', 'Source rows'],
  ['validRecords', 'Valid products'],
  ['created', 'New'],
  ['updated', 'Updated'],
  ['unchanged', 'Unchanged'],
  ['archived', 'Archived'],
  ['needsReview', 'Need review'],
  ['skipped', 'Skipped'],
  ['duplicates', 'Duplicates'],
  ['invalidPrices', 'Invalid prices'],
  ['gstInconsistencies', 'GST mismatches'],
  ['missingImages', 'No images'],
];

export default function ImportPage() {
  const input = useRef(null);
  const toast = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [view, setView] = useState('review');
  const runs = useQuery({ queryKey: ['/imports'], queryFn: () => api('/imports') });

  async function run(dryRun) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api(`/products/import?dryRun=${dryRun}`, { method: 'POST', body: fd });
      setReport(r);
      if (!dryRun) {
        toast.show(`Import applied: ${r.summary.created} new, ${r.summary.updated} updated`);
        ['/products', 'products-summary', '/imports', '/categories'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      }
    } catch (err) {
      toast.show(err.message, 'error');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  const rows = report?.products || [];
  const filtered = view === 'review' ? rows.filter((p) => p.needsReview) : view === 'blocking' ? rows.filter((p) => p.blockingFlags?.length) : rows;

  return (
    <Guard perm="products:import">
      <PageHeader
        back={
          <Link href="/products" className="mb-2 inline-flex items-center gap-1 text-sm text-graphite-400 hover:text-ink">
            <ChevronLeft className="h-4 w-4" /> Products
          </Link>
        }
        title="Import from Excel"
        description="Upload the product workbook. A dry run shows exactly what would change; nothing is saved until you apply it. Fields you have edited by hand in the admin are never overwritten."
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card title="1. Choose the workbook">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn-outline" onClick={() => input.current?.click()}>
                <FileSpreadsheet className="h-4 w-4" /> {file ? 'Choose another file' : 'Choose .xlsx file'}
              </button>
              {file ? <span className="text-sm">{file.name} <span className="text-graphite-400">({Math.round(file.size / 1024)} KB)</span></span> : <span className="text-sm text-graphite-400">Sheets read: Products, Engine Oil, Dare Devil All Product, Remove Product.</span>}
              <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => (setFile(e.target.files?.[0] || null), setReport(null))} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-dark" disabled={!file || busy} onClick={() => run(true)}>
                {busy ? <Spinner /> : <Play className="h-4 w-4" />} 2. Dry run
              </button>
              <button type="button" className="btn-primary" disabled={!file || busy || !report?.summary?.dryRun} onClick={() => setConfirm(true)}>
                3. Apply import
              </button>
            </div>
            {!report ? <p className="hint">Run a dry run first. The apply button unlocks once you have reviewed the result.</p> : null}
          </Card>

          {report ? (
            <>
              {report.summary.dryRun ? (
                <Notice tone="info" title="Dry run — nothing has been saved">Review the products below, then apply the import.</Notice>
              ) : (
                <Notice tone="okay" title="Import applied">Products that need review were saved as “In review” and are not visible on the store.</Notice>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {SUMMARY.map(([k, l]) => (
                  <div key={k} className="card px-3 py-2.5">
                    <p className="text-xs text-graphite-400">{l}</p>
                    <p className={`font-display text-2xl font-semibold tabular ${['invalidPrices', 'gstInconsistencies'].includes(k) && report.summary[k] ? 'text-alert' : ''}`}>{report.summary[k] ?? 0}</p>
                  </div>
                ))}
              </div>
              {report.conflicts?.length || report.visibilityConflicts?.length || report.reconciliation?.length ? (
                <Card title="Data conflicts to resolve in the workbook">
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {(report.conflicts || []).map((c, i) => (
                      <li key={`c${i}`}>{typeof c === 'string' ? c : c.message || JSON.stringify(c)}</li>
                    ))}
                    {(report.visibilityConflicts || []).map((c, i) => (
                      <li key={`v${i}`}>{c.name || c.key}: {c.message || 'marked for removal but also listed for sale'}</li>
                    ))}
                    {(report.reconciliation || []).map((c, i) => (
                      <li key={`r${i}`}>{c.name}: price does not reconcile ({c.note || `difference ${c.diff}`})</li>
                    ))}
                  </ul>
                </Card>
              ) : null}
              <Card title="Products" bodyClass="">
                <div className="px-4 pt-3">
                  <Tabs value={view} onChange={setView} tabs={[['review', `Needs review (${rows.filter((p) => p.needsReview).length})`], ['blocking', `Blocking claims (${rows.filter((p) => p.blockingFlags?.length).length})`], ['all', `All (${rows.length})`]]} />
                </div>
                {filtered.length ? (
                  <div className="overflow-x-auto">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Product</th>
                          <th>Action</th>
                          <th className="text-right">Price</th>
                          <th>GST</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((p) => (
                          <tr key={`${p.sku}-${p.source}`}>
                            <td className="whitespace-nowrap font-mono text-xs">{p.sku || '—'}</td>
                            <td>
                              {p.name}
                              <span className="block text-xs text-graphite-400">
                                {p.department}, row {p.source}
                              </span>
                            </td>
                            <td>
                              <Pill tone={p.action === 'create' ? 'signal' : p.action === 'update' ? 'olive' : 'muted'}>{humanize(p.action)}</Pill>
                              <span className="mt-1 block text-xs text-graphite-400">as {p.importStatus}</span>
                            </td>
                            <td className="text-right tabular">₹{Number(p.priceInclusive).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="whitespace-nowrap">{p.gstRule === 'apparel_threshold' ? '5/18%' : `${p.gstRate}%`}</td>
                            <td className="max-w-md text-xs">
                              {p.blockingFlags?.map((f) => (
                                <p key={f.code + f.evidence} className="flex gap-1 text-alert">
                                  <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" /> {f.message}
                                </p>
                              ))}
                              {(p.statusReasons || []).map((s) => (
                                <p key={s} className="text-caution">{s}</p>
                              ))}
                              {(p.issues || []).filter((i) => i.level !== 'info').slice(0, 4).map((i, k) => (
                                <p key={k} className="text-graphite-600">{i.message}</p>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title="Nothing in this view" />
                )}
              </Card>
              {report.markdown ? (
                <details className="card card-body">
                  <summary className="cursor-pointer font-medium">Full report (Markdown)</summary>
                  <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap rounded bg-stone-200 p-3 text-xs">{report.markdown}</pre>
                </details>
              ) : null}
            </>
          ) : null}
        </div>
        <aside className="space-y-4">
          <Card title="How the import decides" bodyClass="card-body text-sm text-graphite-600">
            <ul className="list-disc space-y-1.5 pl-4">
              <li>Products are matched by a stable key from the sheet, so re-running is safe.</li>
              <li>Prices in the sheet are GST inclusive and checked against base price + GST.</li>
              <li>Unverified safety or protection claims are flagged and the product is held in review.</li>
              <li>Rows marked “(Remove)” or listed on the Remove sheet are archived, never deleted.</li>
              <li>Specs containing placeholders or internal notes are hidden from customers.</li>
            </ul>
          </Card>
          <Card title="Applied imports" bodyClass="">
            {runs.data?.length ? (
              <ul className="divide-y divide-stone-200">
                {runs.data.map((r) => (
                  <li key={r._id} className="px-4 py-2.5 text-sm">
                    <p className="font-medium">{r.sourceFile}</p>
                    <p className="text-xs text-graphite-400">
                      {dateTime(r.createdAt)} by {r.startedBy?.name || 'CLI'}
                    </p>
                    <p className="text-xs">
                      {r.summary?.created ?? 0} new, {r.summary?.updated ?? 0} updated, {r.summary?.needsReview ?? 0} to review
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-graphite-400">No imports applied from the admin yet.</p>
            )}
          </Card>
        </aside>
      </div>
      <Confirm open={confirm} onClose={() => setConfirm(false)} title="Apply this import?" tone="primary" confirmLabel="Apply import" busy={busy} onConfirm={() => run(false)}>
        <p>
          {report?.summary?.created ?? 0} products will be created and {report?.summary?.updated ?? 0} updated. Products needing review stay hidden from the store. This is recorded in the audit log.
        </p>
      </Confirm>
    </Guard>
  );
}
