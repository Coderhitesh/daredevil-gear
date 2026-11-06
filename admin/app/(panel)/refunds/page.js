'use client';

import Link from 'next/link';
import { useList, useUrlState } from '@/lib/hooks';
import { inr, dateTime } from '@/lib/format';
import { PageHeader, DataTable, Pager, Tabs, Status } from '@/components/ui';
import Guard from '@/components/shell/Guard';

export default function RefundsPage() {
  const [state, set] = useUrlState({});
  const list = useList('/refunds', { ...state, limit: 50 });
  return (
    <Guard perm="orders:read">
      <PageHeader title="Refunds" description="Refunds are issued from an order. Refunds are sent to CCAvenue; they usually settle within 5–7 working days." />
      <Tabs value={state.status || ''} onChange={(status) => set({ status })} tabs={[['', 'All'], ['pending', 'Pending'], ['processed', 'Processed'], ['failed', 'Failed']]} />
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
          { key: 'rzp', label: 'CCAvenue refund', render: (r) => <span className="font-mono text-xs">{r.razorpayRefundId || '—'}</span> },
          { key: 'status', label: 'Status', render: (r) => (
            <>
              <Status value={r.status} />
              {r.failureReason ? <span className="block text-xs text-alert">{r.failureReason}</span> : null}
            </>
          ) },
        ]}
        footer={<Pager meta={list.meta} onPage={(page) => set({ page })} />}
      />
    </Guard>
  );
}
