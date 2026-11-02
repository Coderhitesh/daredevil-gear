'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import { download } from '@/lib/api';
import { useCan, useList, useUrlState } from '@/lib/hooks';
import { inr, dateTime, ORDER_STATUS_LABEL } from '@/lib/format';
import { PageHeader, DataTable, Pager, Toolbar, SearchInput, FilterSelect, Status, Tabs, Pill } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import Guard from '@/components/shell/Guard';

const QUEUES = [
  ['', 'All'],
  ['confirmed', 'To process'],
  ['processing', 'Packing'],
  ['shipped,out_for_delivery', 'In transit'],
  ['cancellation_requested,return_requested', 'Requests'],
  ['delivered', 'Delivered'],
  ['pending_payment,payment_failed', 'Unpaid'],
  ['cancelled,refunded,partially_refunded,returned', 'Closed'],
];

export default function OrdersPage() {
  const can = useCan();
  const router = useRouter();
  const toast = useToast();
  const [state, set] = useUrlState({});
  const list = useList('/orders', { ...state, limit: 25 });

  return (
    <Guard perm="orders:read">
      <PageHeader
        title="Orders"
        description="Orders are confirmed only after the payment is verified with Razorpay. Expired unpaid checkouts are hidden unless you include them."
        actions={
          can('reports:read') ? (
            <button type="button" className="btn-outline" onClick={() => download(`/orders/export${state.from ? `?from=${state.from}` : ''}`, 'orders.csv').catch((e) => toast.show(e.message, 'error'))}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
          ) : null
        }
      />
      <Tabs value={state.status || ''} onChange={(status) => set({ status })} tabs={QUEUES} />
      <Toolbar>
        <SearchInput value={state.q} onChange={(q) => set({ q })} placeholder="Order no., email, phone, SKU, payment ID" className="w-full sm:w-96" />
        <FilterSelect label="Payment" value={state.payment} onChange={(payment) => set({ payment })} options={['created', 'captured', 'failed', 'refunded', 'partially_refunded']} />
        <label className="flex items-center gap-1.5 text-sm text-graphite-600">
          From <input type="date" className="input w-auto" value={state.from || ''} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-graphite-600">
          To <input type="date" className="input w-auto" value={state.to || ''} onChange={(e) => set({ to: e.target.value })} />
        </label>
        {!state.status ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-signal" checked={state.includeExpired === 'true'} onChange={(e) => set({ includeExpired: e.target.checked ? 'true' : '' })} /> Include expired
          </label>
        ) : null}
      </Toolbar>
      <DataTable
        rows={list.items}
        isLoading={list.isLoading}
        error={list.error}
        onRowClick={(o) => router.push(`/orders/${o._id}`)}
        columns={[
          {
            key: 'orderNumber',
            label: 'Order',
            render: (o) => (
              <>
                <Link href={`/orders/${o._id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                  {o.orderNumber}
                </Link>
                {o.isGuest ? <span className="ml-1.5"><Pill>Guest</Pill></span> : null}
              </>
            ),
          },
          { key: 'createdAt', label: 'Placed', render: (o) => <span className="whitespace-nowrap text-graphite-600">{dateTime(o.placedAt || o.createdAt)}</span> },
          {
            key: 'customer',
            label: 'Customer',
            render: (o) => (
              <>
                {o.customerName}
                <span className="block text-xs text-graphite-400">{o.email}</span>
              </>
            ),
          },
          { key: 'dest', label: 'Ship to', render: (o) => [o.shippingAddress?.city, o.shippingAddress?.state].filter(Boolean).join(', ') },
          { key: 'items', label: 'Items', align: 'right', render: (o) => o.itemCount },
          { key: 'total', label: 'Total', align: 'right', render: (o) => inr(o.pricing?.grandTotal) },
          { key: 'payment', label: 'Payment', render: (o) => <Status value={o.payment?.status} /> },
          { key: 'status', label: 'Status', render: (o) => <Status value={o.status} label={ORDER_STATUS_LABEL[o.status]} /> },
        ]}
        footer={<Pager meta={list.meta} onPage={(page) => set({ page })} />}
      />
    </Guard>
  );
}
