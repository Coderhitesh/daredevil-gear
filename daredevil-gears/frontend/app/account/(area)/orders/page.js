'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { api } from '@/lib/api-client';
import { inr, date } from '@/lib/format';
import StatusBadge from '@/components/ui/StatusBadge';
import ProductThumb from '@/components/product/ProductThumb';

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['orders', page], queryFn: () => api(`/orders?page=${page}&limit=10`) });
  if (isLoading) return <div className="skeleton h-64" />;
  const orders = data?.data || [];
  if (!orders.length) {
    return (
      <div className="panel flex flex-col items-start gap-3 p-8">
        <Package size={32} strokeWidth={1.25} className="text-graphite-400" />
        <h2 className="font-display text-2xl">No orders yet</h2>
        <p className="text-graphite">When you place an order it will appear here with tracking and invoices.</p>
        <Link href="/shop" className="btn-dark mt-2">
          Shop the range
        </Link>
      </div>
    );
  }
  return (
    <div>
      <h2 className="sr-only">Orders</h2>
      <ul className="space-y-3">
        {orders.map((o) => (
          <li key={o.orderNumber}>
            <Link href={`/account/orders/${o.orderNumber}`} className="panel flex flex-wrap items-center gap-4 p-4 hover:border-graphite">
              <ProductThumb image={o.image ? { url: o.image } : null} name={o.firstItem} size={56} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{o.orderNumber}</p>
                <p className="truncate text-sm text-graphite">
                  {o.firstItem}
                  {o.itemCount > 1 ? ` and ${o.itemCount - 1} more` : ''}
                </p>
                <p className="text-sm text-graphite-400">Placed {date(o.createdAt)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={o.status} label={o.statusLabel} />
                <span className="tabular font-medium">{inr(o.total)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {data.meta.totalPages > 1 ? (
        <div className="mt-6 flex gap-2">
          <button type="button" className="btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Newer
          </button>
          <button type="button" className="btn-outline btn-sm" disabled={page >= data.meta.totalPages} onClick={() => setPage(page + 1)}>
            Older
          </button>
        </div>
      ) : null}
    </div>
  );
}
