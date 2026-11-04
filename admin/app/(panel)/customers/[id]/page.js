'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Download, UserX, UserCheck } from 'lucide-react';
import { api, download } from '@/lib/api';
import { useAction, useCan } from '@/lib/hooks';
import { inr, dateTime, date, humanize, ORDER_STATUS_LABEL } from '@/lib/format';
import { PageHeader, Card, KeyValue, Status, Spinner, Textarea, Confirm, Notice, Empty } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import Guard from '@/components/shell/Guard';

export default function CustomerPage({ params }) {
  const { id } = use(params);
  const { data: c, isLoading, error } = useQuery({ queryKey: ['customer', id], queryFn: () => api(`/customers/${id}`) });
  if (isLoading || !c) return <div className="flex justify-center py-20">{error ? <p className="text-alert">{error.message}</p> : <Spinner className="h-6 w-6" />}</div>;
  return (
    <Guard perm="customers:read">
      <CustomerView c={c} />
    </Guard>
  );
}

function CustomerView({ c }) {
  const can = useCan();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [dialog, setDialog] = useState(null);
  const invalidate = [['customer', c.id], '/customers'];
  const addNote = useAction(() => api(`/customers/${c.id}/notes`, { method: 'POST', body: { note: note.trim() } }), { invalidate, success: 'Note added', onSuccess: () => setNote('') });
  const setStatus = useAction(({ status, reason }) => api(`/customers/${c.id}/status`, { method: 'POST', body: { status, reason } }), { invalidate, success: (r) => `Account ${r.status}`, onSuccess: () => setDialog(null) });
  const privacy = useAction(({ requestId, status, note: n }) => api(`/customers/${c.id}/privacy-requests/${requestId}`, { method: 'PATCH', body: { status, note: n || undefined } }), { invalidate, success: 'Privacy request updated', onSuccess: () => setDialog(null) });
  const open = (c.privacyRequests || []).filter((p) => p.status === 'open');

  return (
    <>
      <PageHeader
        back={
          <Link href="/customers" className="mb-2 inline-flex items-center gap-1 text-sm text-graphite-400 hover:text-ink">
            <ChevronLeft className="h-4 w-4" /> Customers
          </Link>
        }
        title={c.name}
        description={
          <span className="flex items-center gap-2">
            {c.email} <Status value={c.status} />
          </span>
        }
        actions={
          <>
            {can('customers:export') ? (
              <button type="button" className="btn-outline" onClick={() => download(`/customers/${c.id}/export`, 'customer.json').catch((e) => toast.show(e.message, 'error'))}>
                <Download className="h-4 w-4" /> Export data
              </button>
            ) : null}
            {can('customers:write') && c.status === 'active' ? (
              <button type="button" className="btn-danger" onClick={() => setDialog({ kind: 'suspend' })}>
                <UserX className="h-4 w-4" /> Suspend
              </button>
            ) : null}
            {can('customers:write') && c.status === 'suspended' ? (
              <button type="button" className="btn-outline" onClick={() => setStatus.mutate({ status: 'active' })}>
                <UserCheck className="h-4 w-4" /> Reactivate
              </button>
            ) : null}
          </>
        }
      />
      {open.length ? (
        <div className="mb-4 space-y-2">
          {open.map((p) => (
            <Notice
              key={p._id}
              tone="caution"
              title={`Open ${humanize(p.type)} request from ${date(p.createdAt || p.requestedAt)}`}
              action={
                can('customers:export') ? (
                  <span className="flex gap-2">
                    <button type="button" className="btn-dark btn-xs" onClick={() => setDialog({ kind: 'privacy', request: p, status: 'completed' })}>
                      {p.type === 'erasure' ? 'Erase account' : 'Mark completed'}
                    </button>
                    <button type="button" className="btn-outline btn-xs" onClick={() => setDialog({ kind: 'privacy', request: p, status: 'rejected' })}>
                      Reject
                    </button>
                  </span>
                ) : null
              }
            >
              {p.note || 'Respond within the time stated in the privacy policy.'}
            </Notice>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card title={`Orders (${c.orders.length})`} bodyClass="">
            {c.orders.length ? (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {c.orders.map((o) => (
                    <tr key={o._id}>
                      <td><Link className="link" href={`/orders/${o._id}`}>{o.orderNumber}</Link></td>
                      <td>{date(o.createdAt)}</td>
                      <td><Status value={o.status} label={ORDER_STATUS_LABEL[o.status]} /></td>
                      <td><Status value={o.payment?.status} /></td>
                      <td className="text-right tabular">{inr(o.pricing?.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty title="No orders yet" />
            )}
          </Card>
          <Card title="Addresses">
            {c.addresses.length ? (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {c.addresses.map((a) => (
                  <li key={a._id} className="rounded border border-stone-300 p-3 text-sm">
                    <p className="font-medium">
                      {a.fullName} {a.label ? <span className="text-xs text-graphite-400">({a.label})</span> : null}
                    </p>
                    <p>{a.line1}{a.line2 ? `, ${a.line2}` : ''}</p>
                    <p>{a.city}, {a.state} {a.pincode}</p>
                    <p>{a.phone}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-graphite-400">No saved addresses.</p>
            )}
          </Card>
          {c.reviews.length ? (
            <Card title="Reviews" bodyClass="">
              <ul className="divide-y divide-stone-200">
                {c.reviews.map((r) => (
                  <li key={r.id} className="flex justify-between px-4 py-2.5 text-sm">
                    <span>{r.product} — {r.rating}/5</span>
                    <Status value={r.status} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
        <aside className="space-y-4">
          <Card title="Account">
            <KeyValue
              rows={[
                ['Phone', c.phone],
                ['Email verified', c.emailVerified ? dateTime(c.emailVerifiedAt) : 'No'],
                ['Joined', dateTime(c.createdAt)],
                ['Last sign-in', dateTime(c.lastLoginAt)],
                ['Active sessions', c.activeSessions],
                ['Marketing emails', c.notificationPrefs?.marketing ? 'Opted in' : 'Not opted in'],
                c.suspendedReason ? ['Suspended because', c.suspendedReason] : null,
              ]}
            />
          </Card>
          <Card title="Support notes">
            <ul className="mb-3 space-y-2">
              {(c.supportNotes || []).map((n, i) => (
                <li key={i} className="rounded bg-stone-200 px-3 py-2 text-sm">
                  {n.note}
                  <span className="mt-0.5 block text-xs text-graphite-400">{n.byName}, {dateTime(n.at)}</span>
                </li>
              ))}
            </ul>
            <Textarea rows={2} label="Add a note" value={note} onChange={(e) => setNote(e.target.value)} hint="Staff only. Do not record card or ID numbers." />
            <button type="button" className="btn-outline btn-xs mt-2" disabled={note.trim().length < 2 || addNote.isPending} onClick={() => addNote.mutate()}>
              Add note
            </button>
          </Card>
          {(c.privacyRequests || []).some((p) => p.status !== 'open') ? (
            <Card title="Privacy request history" bodyClass="">
              <ul className="divide-y divide-stone-200 text-sm">
                {c.privacyRequests.filter((p) => p.status !== 'open').map((p) => (
                  <li key={p._id} className="flex justify-between px-4 py-2">
                    <span>{humanize(p.type)}</span>
                    <span className="text-xs text-graphite-400">{humanize(p.status)} {date(p.completedAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </aside>
      </div>
      <Confirm open={dialog?.kind === 'suspend'} onClose={() => setDialog(null)} title="Suspend this account?" tone="danger" confirmLabel="Suspend" reason busy={setStatus.isPending} onConfirm={(reason) => setStatus.mutate({ status: 'suspended', reason })}>
        <p>The customer is signed out everywhere and cannot sign in or place orders. Existing orders are not affected.</p>
      </Confirm>
      <Confirm
        open={dialog?.kind === 'privacy'}
        onClose={() => setDialog(null)}
        title={dialog?.status === 'rejected' ? 'Reject this request?' : dialog?.request?.type === 'erasure' ? 'Erase this account?' : 'Mark request completed?'}
        tone={dialog?.request?.type === 'erasure' && dialog?.status === 'completed' ? 'danger' : 'dark'}
        confirmLabel={dialog?.request?.type === 'erasure' && dialog?.status === 'completed' ? 'Erase personal data' : 'Confirm'}
        reason={dialog?.status === 'rejected'}
        reasonLabel="Reason (sent to the customer)"
        busy={privacy.isPending}
        onConfirm={(n) => privacy.mutate({ requestId: dialog.request._id, status: dialog.status, note: n })}
      >
        {dialog?.request?.type === 'erasure' && dialog?.status === 'completed' ? (
          <p>Name, email, phone, saved addresses and wishlist are removed and the account is closed. Order and invoice records are kept in anonymised form because tax law requires them. This cannot be undone.</p>
        ) : (
          <p>Record the outcome of this {humanize(dialog?.request?.type || '')} request.</p>
        )}
      </Confirm>
    </>
  );
}
