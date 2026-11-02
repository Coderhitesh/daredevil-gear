'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, X, Flag, BadgeCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useList, useUrlState } from '@/lib/hooks';
import { dateTime, storefrontUrl } from '@/lib/format';
import { PageHeader, Tabs, Pager, Status, Pill, Empty, Confirm, Notice } from '@/components/ui';
import Guard from '@/components/shell/Guard';

export default function ReviewsPage() {
  const [state, set] = useUrlState({ status: 'pending' });
  const query = { ...state, limit: 30, ...(state.status === 'reported' ? { status: '', reported: 'true' } : {}) };
  const list = useList('/reviews', query);
  const [reject, setReject] = useState(null);
  const moderate = useAction(({ id, status, rejectionReason }) => api(`/reviews/${id}`, { method: 'PATCH', body: { status, rejectionReason } }), {
    invalidate: ['/reviews'],
    success: (_d, v) => (v.status === 'approved' ? 'Review published' : v.status === 'rejected' ? 'Review rejected' : 'Review moved back to pending'),
    onSuccess: () => setReject(null),
  });

  return (
    <Guard perm="reviews:moderate">
      <PageHeader title="Reviews" description="Only customers who have bought the product can review it. Publish every genuine review, including critical ones — reject only abuse, spam, personal data or off-topic content." />
      <div className="mb-4">
        <Notice tone="info">Reviews must never be written, edited or paid for by the business. Ratings on the store are calculated only from approved reviews.</Notice>
      </div>
      <Tabs value={state.status} onChange={(status) => set({ status })} tabs={[['pending', 'Awaiting moderation'], ['approved', 'Published'], ['rejected', 'Rejected'], ['reported', 'Reported']]} />
      {list.items.length ? (
        <ul className="space-y-3">
          {list.items.map((r) => (
            <li key={r._id} className="card card-body">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="text-signal" aria-label={`${r.rating} out of 5`}>{'★'.repeat(r.rating)}</span>
                    <span className="text-stone-400">{'★'.repeat(5 - r.rating)}</span>
                    {r.title ? <strong className="ml-2">{r.title}</strong> : null}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-graphite">{r.body}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-graphite-400">
                    <span>{r.authorName || r.user?.name}</span>
                    {r.isVerifiedPurchase ? <Pill tone="okay"><BadgeCheck className="h-3 w-3" /> Verified purchase</Pill> : <Pill tone="caution">Not verified</Pill>}
                    <span>on</span>
                    {r.product ? <a className="link" href={storefrontUrl(`/product/${r.product.slug}`)} target="_blank" rel="noreferrer">{r.product.name}</a> : null}
                    <span>{dateTime(r.createdAt)}</span>
                    {r.order ? <Link className="link" href={`/orders/${r.order}`}>order</Link> : null}
                  </p>
                  {r.reportCount ? (
                    <p className="mt-2 flex items-center gap-1 text-xs text-alert">
                      <Flag className="h-3 w-3" /> Reported {r.reportCount} time{r.reportCount > 1 ? 's' : ''}: {(r.reports || []).map((x) => x.reason).filter(Boolean).join('; ')}
                    </p>
                  ) : null}
                  {r.rejectionReason ? <p className="mt-1 text-xs text-graphite-600">Rejected: {r.rejectionReason}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Status value={r.status} />
                  {r.status !== 'approved' ? (
                    <button type="button" className="btn-outline btn-xs" onClick={() => moderate.mutate({ id: r._id, status: 'approved' })} disabled={moderate.isPending}>
                      <Check className="h-3.5 w-3.5" /> Publish
                    </button>
                  ) : null}
                  {r.status !== 'rejected' ? (
                    <button type="button" className="btn-danger btn-xs" onClick={() => setReject(r)}>
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card">{list.isLoading ? <div className="skeleton m-4 h-24" /> : <Empty title="No reviews in this view" />}</div>
      )}
      <div className="card mt-3">
        <Pager meta={list.meta} onPage={(page) => set({ page })} />
      </div>
      <Confirm open={Boolean(reject)} onClose={() => setReject(null)} title="Reject this review?" tone="danger" confirmLabel="Reject" reason reasonLabel="Reason (which guideline it breaks)" busy={moderate.isPending} onConfirm={(reason) => moderate.mutate({ id: reject._id, status: 'rejected', rejectionReason: reason })}>
        <p>Negative opinions are not a reason to reject. Reject only for abuse, spam, personal information, or content unrelated to the product.</p>
      </Confirm>
    </Guard>
  );
}
