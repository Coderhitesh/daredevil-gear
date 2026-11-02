'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useList, useUrlState } from '@/lib/hooks';
import { dateTime, humanize } from '@/lib/format';
import { PageHeader, DataTable, Pager, Tabs, Status } from '@/components/ui';
import Guard from '@/components/shell/Guard';

export default function ReturnsPage() {
  const router = useRouter();
  const [state, set] = useUrlState({});
  const list = useList('/returns', { ...state, limit: 50 });
  return (
    <Guard perm="orders:read">
      <PageHeader title="Returns" description="Open a return to approve it, schedule pickup, mark it received and refund the customer — all from the order page." />
      <Tabs
        value={state.status || ''}
        onChange={(status) => set({ status })}
        tabs={[['', 'All'], ['requested', 'New'], ['approved', 'Approved'], ['pickup_scheduled', 'Pickup scheduled'], ['received', 'Received'], ['refunded', 'Refunded'], ['rejected', 'Rejected']]}
      />
      <DataTable
        rows={list.items}
        isLoading={list.isLoading}
        error={list.error}
        onRowClick={(r) => r.order && router.push(`/orders/${r.order._id}`)}
        columns={[
          { key: 'requestNumber', label: 'Return', render: (r) => <span className="font-medium">{r.requestNumber}</span> },
          { key: 'createdAt', label: 'Requested', render: (r) => <span className="whitespace-nowrap">{dateTime(r.createdAt)}</span> },
          { key: 'order', label: 'Order', render: (r) => (r.order ? <Link className="link" href={`/orders/${r.order._id}`} onClick={(e) => e.stopPropagation()}>{r.order.orderNumber}</Link> : '—') },
          { key: 'customer', label: 'Customer', render: (r) => r.order?.customerName || r.order?.email },
          { key: 'type', label: 'Type', render: (r) => humanize(r.type) },
          { key: 'reason', label: 'Reason', render: (r) => <span className="line-clamp-2 max-w-xs">{r.reason}</span> },
          { key: 'items', label: 'Items', render: (r) => r.items.map((i) => `${i.quantity} × ${i.sku}`).join(', ') },
          { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
        ]}
        footer={<Pager meta={list.meta} onPage={(page) => set({ page })} />}
      />
    </Guard>
  );
}
