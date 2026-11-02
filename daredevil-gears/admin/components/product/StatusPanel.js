'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, AlertTriangle, CheckCircle2, Gavel, History } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useCan } from '@/lib/hooks';
import { dateTime, humanize } from '@/lib/format';
import { Card, Confirm, Modal, Status, Pill, Select, Textarea, Spinner } from '@/components/ui';

export default function StatusPanel({ product }) {
  const can = useCan();
  const qc = useQueryClient();
  const router = useRouter();
  const [dialog, setDialog] = useState(null); // { kind, ... }
  const publishable = can('products:publish');
  const setProduct = (p) => {
    qc.setQueryData(['product', product._id], p);
    qc.invalidateQueries({ queryKey: ['/products'] });
    qc.invalidateQueries({ queryKey: ['products-summary'] });
  };

  const status = useAction(({ status: s, note }) => api(`/products/${product._id}/status`, { method: 'POST', body: { status: s, note: note || undefined } }), {
    success: (_d, v) => `Product ${v.status === 'published' ? 'published' : `moved to ${v.status}`}`,
    onSuccess: (p) => (setProduct(p), setDialog(null)),
  });
  const resolve = useAction(({ flagId, note }) => api(`/products/${product._id}/flags/${flagId}/resolve`, { method: 'POST', body: { note } }), { success: 'Flag resolved', onSuccess: (p) => (setProduct(p), setDialog(null)) });
  const legal = useAction((body) => api(`/products/${product._id}/legal-review`, { method: 'POST', body }), { success: 'Legal review recorded', onSuccess: (p) => (setProduct(p), setDialog(null)) });
  const remove = useAction(() => api(`/products/${product._id}`, { method: 'DELETE' }), {
    invalidate: ['/products', 'products-summary'],
    success: (d) => (d.archived ? 'Product archived (it has order history)' : 'Product deleted'),
    onSuccess: (d) => (d.archived ? qc.invalidateQueries({ queryKey: ['product', product._id] }) : router.replace('/products')),
  });

  const open = (product.flags || []).filter((f) => !f.resolvedAt);
  const resolved = (product.flags || []).filter((f) => f.resolvedAt);
  const blockers = product.publishBlockers || [];
  const lr = product.compliance?.legalReview;

  return (
    <aside className="space-y-4">
      <Card title="Status">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Status value={product.status} />
            <span className="text-xs text-graphite-400">{product.publishedAt ? `Published ${dateTime(product.publishedAt)}` : 'Never published'}</span>
          </div>
          {blockers.length ? (
            <div className="rounded border border-alert/30 bg-alert-light p-3 text-sm">
              <p className="flex items-center gap-1.5 font-semibold text-alert">
                <ShieldAlert className="h-4 w-4" /> Cannot be published yet
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-graphite">
                {[...new Set(blockers)].map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ) : product.status !== 'published' ? (
            <p className="flex items-center gap-1.5 text-sm text-okay">
              <CheckCircle2 className="h-4 w-4" /> Ready to publish
            </p>
          ) : null}
          {publishable ? (
            <div className="flex flex-wrap gap-2">
              {product.status !== 'published' ? (
                <button type="button" className="btn-primary" disabled={blockers.length > 0} onClick={() => setDialog({ kind: 'status', status: 'published' })}>
                  Publish
                </button>
              ) : null}
              {product.status !== 'review' && product.status !== 'archived' ? (
                <button type="button" className="btn-outline" onClick={() => setDialog({ kind: 'status', status: 'review' })}>
                  Send to review
                </button>
              ) : null}
              {['published', 'review'].includes(product.status) ? (
                <button type="button" className="btn-outline" onClick={() => setDialog({ kind: 'status', status: 'draft' })}>
                  Unpublish to draft
                </button>
              ) : null}
              {product.status !== 'archived' ? (
                <button type="button" className="btn-ghost" onClick={() => setDialog({ kind: 'status', status: 'archived' })}>
                  Archive
                </button>
              ) : (
                <button type="button" className="btn-outline" onClick={() => setDialog({ kind: 'status', status: 'draft' })}>
                  Restore to draft
                </button>
              )}
            </div>
          ) : null}
        </div>
      </Card>

      {lr?.required ? (
        <Card title="Legal review" actions={<Status value={lr.status} />}>
          <p className="text-sm text-graphite-600">This product is restricted (for example a self-defence item, blade or force-style marking). A qualified reviewer must approve it before it can be sold.</p>
          {lr.notes ? <p className="mt-2 rounded bg-stone-200 px-2.5 py-2 text-sm">{lr.notes}</p> : null}
          {lr.reviewedAt ? <p className="mt-1 text-xs text-graphite-400">Reviewed {dateTime(lr.reviewedAt)}</p> : null}
          {can('products:publish') && can('settings:write') ? (
            <button type="button" className="btn-outline mt-3" onClick={() => setDialog({ kind: 'legal' })}>
              <Gavel className="h-4 w-4" /> Record decision
            </button>
          ) : null}
        </Card>
      ) : null}

      <Card title="Compliance checks" actions={open.length ? <Pill tone={open.some((f) => f.severity === 'blocking') ? 'alert' : 'caution'}>{open.length} open</Pill> : <Pill tone="okay">Clear</Pill>} bodyClass="">
        {open.length ? (
          <ul className="divide-y divide-stone-200">
            {open.map((f) => (
              <li key={f._id} className="px-4 py-3 text-sm">
                <p className="flex items-start gap-1.5">
                  {f.severity === 'blocking' ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-alert" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-caution" />}
                  <span>
                    <span className="font-medium">{f.message}</span>
                    {f.field ? <span className="block text-xs text-graphite-400">In {humanize(f.field)}</span> : null}
                    {f.evidence ? <span className="mt-1 block rounded bg-stone-200 px-2 py-1 text-xs">“{f.evidence}”</span> : null}
                  </span>
                </p>
                {publishable ? (
                  <button type="button" className="btn-ghost btn-xs mt-1.5" onClick={() => setDialog({ kind: 'flag', flag: f })}>
                    Mark resolved
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-graphite-400">No open issues. Text is re-checked every time you save.</p>
        )}
        {resolved.length ? (
          <details className="border-t border-stone-200 px-4 py-2.5 text-sm">
            <summary className="cursor-pointer text-graphite-600">{resolved.length} resolved</summary>
            <ul className="mt-2 space-y-2">
              {resolved.map((f) => (
                <li key={f._id} className="text-xs text-graphite-600">
                  <span className="font-medium text-graphite">{f.message}</span> — {f.resolutionNote} ({dateTime(f.resolvedAt)})
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>

      {product.statusHistory?.length ? (
        <Card title="History" bodyClass="">
          <ul className="max-h-64 divide-y divide-stone-200 overflow-y-auto">
            {[...product.statusHistory].reverse().map((h, i) => (
              <li key={i} className="flex gap-2 px-4 py-2 text-xs">
                <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-graphite-400" />
                <span>
                  {humanize(h.from || 'new')} to <strong>{humanize(h.to)}</strong>
                  {h.note ? ` — ${h.note}` : ''}
                  <span className="block text-graphite-400">{dateTime(h.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {can('products:write') ? (
        <button type="button" className="btn-danger w-full" onClick={() => setDialog({ kind: 'delete' })}>
          Delete product
        </button>
      ) : null}

      <Confirm
        open={dialog?.kind === 'status'}
        onClose={() => setDialog(null)}
        title={dialog?.status === 'published' ? 'Publish this product?' : `Move to ${dialog?.status}?`}
        confirmLabel={dialog?.status === 'published' ? 'Publish' : 'Confirm'}
        tone={dialog?.status === 'published' ? 'primary' : 'dark'}
        busy={status.isPending}
        onConfirm={() => status.mutate({ status: dialog.status })}
      >
        {dialog?.status === 'published' ? <p>It will appear on the storefront and in search straight away. Check the price, photos and description first.</p> : dialog?.status === 'archived' ? <p>Archived products are hidden from the store. Past orders are kept.</p> : <p>The product will be hidden from the storefront.</p>}
      </Confirm>
      <Confirm
        open={dialog?.kind === 'flag'}
        onClose={() => setDialog(null)}
        title="Resolve this check"
        confirmLabel="Mark resolved"
        reason
        reasonMin={10}
        reasonLabel="What did you change or verify?"
        busy={resolve.isPending}
        onConfirm={(note) => resolve.mutate({ flagId: dialog.flag._id, note })}
      >
        <p className="font-medium">{dialog?.flag?.message}</p>
        <p className="text-sm">Edit the text first if the claim is wrong. Only resolve without editing if you hold evidence (for example a verified lab certificate) — your note is recorded with your name.</p>
      </Confirm>
      <LegalDialog open={dialog?.kind === 'legal'} onClose={() => setDialog(null)} busy={legal.isPending} onSubmit={(b) => legal.mutate(b)} current={lr} />
      <Confirm open={dialog?.kind === 'delete'} onClose={() => setDialog(null)} title="Delete this product?" tone="danger" confirmLabel="Delete" busy={remove.isPending} onConfirm={() => remove.mutate()}>
        <p>Products that appear in any order are archived instead of deleted so invoices and order history stay intact.</p>
      </Confirm>
    </aside>
  );
}

function LegalDialog({ open, onClose, onSubmit, busy, current }) {
  const [status, setStatus] = useState(current?.status === 'not_required' ? 'pending' : current?.status || 'pending');
  const [notes, setNotes] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Legal review decision"
      size="sm"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-dark" disabled={busy || notes.trim().length < 10} onClick={() => onSubmit({ status, notes: notes.trim() })}>
            {busy ? <Spinner /> : null}
            Save decision
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Select label="Decision" value={status} onChange={(e) => setStatus(e.target.value)} options={[['pending', 'Pending'], ['approved', 'Approved for sale'], ['rejected', 'Rejected — do not sell']]} />
        <Textarea label="Reviewer, basis and conditions" required rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} hint="At least 10 characters: who reviewed it, the legal basis, and any conditions (adults only, states excluded)." />
      </div>
    </Modal>
  );
}
