'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useList, useUrlState } from '@/lib/hooks';
import { inr, dateTime } from '@/lib/format';
import { PageHeader, DataTable, Pager, Tabs, Status } from '@/components/ui';
import Guard from '@/components/shell/Guard';
import { MarkPaidDialog } from '@/components/order/dialogs';
import { useCan } from '@/lib/hooks';

export default function RefundsPage() {
  const [state, set] = useUrlState({});
  const list = useList('/refunds', { ...state, limit: 50 });
  const can = useCan();
  const [paying, setPaying] = useState(null);
  return (
    <Guard perm="orders:read">
      <PageHeader title="Refunds" description="Refunds are issued from an order. Online payments are refunded through CCAvenue (usually 5–7 working days). Cash-on-delivery refunds are sent by you via bank transfer or UPI: they stay pending until you mark them paid." />
      <Tabs value={state.status || ''} onChange={(status) => set({ status })} tabs={[['', 'All'], ['pending', 'Pending'], ['processed', 'Processed'], ['failed', 'Failed']]} />
      <Tabs value={state.mode || ''} onChange={(mode) => set({ mode })} tabs={[['', 'All methods'], ['razorpay', 'CCAvenue'], ['manual', 'Bank / UPI (COD)']]} />
      <DataTable
        rows={list.items}
        isLoading={list.isLoading}
        error={list.error}
        columns={[
          { key: 'createdAt', label: 'Created', render: (r) => <span className="whitespace-nowrap">{dateTime(r.createdAt)}</span> },
          { key: 'order', label: 'Order', render: (r) => (r.order ? <Link className="link" href={`/orders/${r.order._id}`}>{r.order.orderNumber}</Link> : '—') },
          { key: 'amount', label: 'Amount', align: 'right', render: (r) => inr(r.amount) },
          { key: 'reason', label: 'Reason' },
          { key: 'restock', label: 'Restocked', render: (r) => (r.restock ? 'Yes' : 'No') },
          { key: 'by', label: 'By', render: (r) => r.initiatedBy?.name || 'System' },
          { key: 'rzp', label: 'Reference', render: (r) => <span className="font-mono text-xs">{r.mode === 'manual' ? r.manualReference || 'Not sent yet' : r.razorpayRefundId || '—'}</span> },
          { key: 'status', label: 'Status', render: (r) => (
            <>
              <Status value={r.status} />
              {r.failureReason ? <span className="block text-xs text-alert">{r.failureReason}</span> : null}
            </>
          ) },
          { key: 'act', label: '', render: (r) => (r.mode === 'manual' && r.status === 'pending' && can('refunds:write') ? <button type="button" className="btn-outline btn-xs whitespace-nowrap" onClick={() => setPaying(r)}>Mark as paid</button> : null) },
        ]}
        footer={<Pager meta={list.meta} onPage={(page) => set({ page })} />}
      />
      {paying ? <MarkPaidDialog refund={paying} onClose={() => setPaying(null)} /> : null}
    </Guard>
  );
}
