'use client';

import Link from 'next/link';
import { useList, useUrlState } from '@/lib/hooks';
import { inr, dateTime, humanize, paymentMethod } from '@/lib/format';
import { PageHeader, DataTable, Pager, Tabs, Status } from '@/components/ui';
import Guard from '@/components/shell/Guard';

export default function PaymentsPage() {
  const [state, set] = useUrlState({});
  const list = useList('/payments', { ...state, limit: 50 });
  return (
    <Guard perm="orders:read">
      <PageHeader title="Payments" description="CCAvenue payment attempts. A payment counts only after CCAvenue's encrypted response (or a status check) is verified and the amount matches the order. Card details never reach our servers." />
      <Tabs value={state.status || ''} onChange={(status) => set({ status })} tabs={[['', 'All'], ['captured', 'Captured'], ['failed', 'Failed'], ['created', 'Not completed'], ['partially_refunded', 'Partly refunded'], ['refunded', 'Refunded']]} />
      <DataTable
        rows={list.items}
        isLoading={list.isLoading}
        error={list.error}
        columns={[
          { key: 'createdAt', label: 'When', render: (p) => <span className="whitespace-nowrap">{dateTime(p.createdAt)}</span> },
          { key: 'order', label: 'Order', render: (p) => (p.order ? <Link className="link" href={`/orders/${p.order._id}`}>{p.order.orderNumber}</Link> : '—') },
          { key: 'ids', label: 'CCAvenue', render: (p) => <span className="font-mono text-xs">{p.razorpayPaymentId || p.razorpayOrderId}</span> },
          { key: 'method', label: 'Method', render: (p) => [p.method ? paymentMethod(p.method) : '', p.meta?.cardNetwork, p.meta?.cardLast4 && `•••• ${p.meta.cardLast4}`, p.meta?.bank, p.meta?.wallet, p.meta?.vpa].filter(Boolean).join(', ') || '—' },
          { key: 'amount', label: 'Amount', align: 'right', render: (p) => inr(p.amount) },
          { key: 'refunded', label: 'Refunded', align: 'right', render: (p) => (p.amountRefunded ? inr(p.amountRefunded) : '—') },
          { key: 'verifiedVia', label: 'Verified by', render: (p) => (p.verifiedVia ? humanize(p.verifiedVia) : '—') },
          { key: 'status', label: 'Status', render: (p) => (
            <>
              <Status value={p.status} />
              {p.errorDescription ? <span className="mt-0.5 block max-w-xs text-xs text-alert">{p.errorDescription}</span> : null}
            </>
          ) },
        ]}
        footer={<Pager meta={list.meta} onPage={(page) => set({ page })} />}
      />
    </Guard>
  );
}
