'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { useList, useUrlState } from '@/lib/hooks';
import { dateTime, humanize } from '@/lib/format';
import { PageHeader, DataTable, Pager, Pill } from '@/components/ui';
import Guard from '@/components/shell/Guard';

const TONE = { sale: 'signal', reserve: 'muted', release: 'muted', import: 'olive', adjustment: 'olive', correction: 'caution', damaged: 'alert', restock_cancel: 'okay', restock_return: 'okay' };

export default function MovementsPage() {
  const [state, set] = useUrlState({});
  const list = useList('/inventory/movements', { ...state, limit: 100 });
  const filtered = state.variant || state.product;

  return (
    <Guard perm="products:read">
      <PageHeader
        back={
          <Link href="/inventory" className="mb-2 inline-flex items-center gap-1 text-sm text-graphite-400 hover:text-ink">
            <ChevronLeft className="h-4 w-4" /> Inventory
          </Link>
        }
        title="Stock ledger"
        description="Every change to stock, newest first. Reserve and release rows change reserved units, not stock on hand."
        actions={filtered ? <button type="button" className="btn-outline" onClick={() => set({ variant: '', product: '' })}>Show all products</button> : null}
      />
      <DataTable
        rows={list.items}
        isLoading={list.isLoading}
        error={list.error}
        columns={[
          { key: 'createdAt', label: 'When', render: (m) => <span className="whitespace-nowrap">{dateTime(m.createdAt)}</span> },
          { key: 'sku', label: 'SKU', render: (m) => <span className="font-mono text-xs">{m.sku}</span> },
          { key: 'type', label: 'Type', render: (m) => <Pill tone={TONE[m.type]}>{humanize(m.type)}</Pill> },
          { key: 'quantity', label: 'Change', align: 'right', render: (m) => <span className={m.quantity > 0 ? 'text-okay' : m.quantity < 0 ? 'text-alert' : ''}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</span> },
          { key: 'stockAfter', label: 'On hand after', align: 'right', render: (m) => m.stockAfter ?? '—' },
          { key: 'availableAfter', label: 'Available after', align: 'right', render: (m) => m.availableAfter ?? '—' },
          { key: 'reason', label: 'Reason', render: (m) => m.reason || '—' },
          { key: 'order', label: 'Order', render: (m) => (m.order ? <Link className="link" href={`/orders/${m.order._id}`}>{m.order.orderNumber}</Link> : '—') },
          { key: 'actor', label: 'By', render: (m) => m.actor?.name || 'System' },
        ]}
        footer={<Pager meta={list.meta} onPage={(page) => set({ page })} />}
      />
    </Guard>
  );
}
