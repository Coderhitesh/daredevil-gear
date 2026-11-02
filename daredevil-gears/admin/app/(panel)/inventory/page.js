'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SlidersHorizontal, History } from 'lucide-react';
import { useCan, useList, useUrlState } from '@/lib/hooks';
import { PageHeader, DataTable, Pager, Toolbar, SearchInput, Checkbox, Status } from '@/components/ui';
import Guard from '@/components/shell/Guard';
import AdjustStock from '@/components/inventory/AdjustStock';

export default function InventoryPage() {
  const can = useCan();
  const [state, set] = useUrlState({});
  const list = useList('/inventory', { ...state, limit: 100 });
  const [adjust, setAdjust] = useState(null);

  return (
    <Guard perm="products:read">
      <PageHeader
        title="Inventory"
        description="On hand is physical stock. Reserved units are held for 30 minutes while a customer pays, then released automatically if payment does not complete."
        actions={
          <Link href="/inventory/movements" className="btn-outline">
            <History className="h-4 w-4" /> Stock ledger
          </Link>
        }
      />
      <Toolbar>
        <SearchInput value={state.q} onChange={(q) => set({ q })} placeholder="Search by SKU" />
        <Checkbox label="Low stock only (5 or fewer available)" checked={state.low === 'true'} onChange={(e) => set({ low: e.target.checked ? 'true' : '' })} />
      </Toolbar>
      <DataTable
        rows={list.items}
        isLoading={list.isLoading}
        error={list.error}
        columns={[
          { key: 'sku', label: 'SKU', render: (v) => <span className="font-mono text-xs">{v.sku}</span> },
          {
            key: 'product',
            label: 'Product',
            render: (v) => (
              <>
                <Link className="link" href={`/products/${v.product?._id}`}>
                  {v.product?.name}
                </Link>
                {v.title && v.title !== 'Default' ? <span className="block text-xs text-graphite-400">{v.title}</span> : null}
              </>
            ),
          },
          { key: 'pstatus', label: 'Listing', render: (v) => <Status value={v.product?.status} /> },
          { key: 'stock', label: 'On hand', align: 'right' },
          { key: 'reserved', label: 'Reserved', align: 'right' },
          {
            key: 'available',
            label: 'Available',
            align: 'right',
            render: (v) => <span className={v.available === 0 ? 'font-semibold text-alert' : v.available <= (v.lowStockThreshold ?? 5) ? 'font-semibold text-caution' : ''}>{v.available}</span>,
          },
          { key: 'lowStockThreshold', label: 'Alert at', align: 'right' },
          {
            key: 'actions',
            label: '',
            render: (v) => (
              <span className="flex justify-end gap-1">
                <Link href={`/inventory/movements?variant=${v._id}`} className="btn-ghost btn-xs" aria-label={`History for ${v.sku}`}>
                  <History className="h-3.5 w-3.5" />
                </Link>
                {can('inventory:write') ? (
                  <button type="button" className="btn-outline btn-xs" onClick={() => setAdjust(v)}>
                    <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust
                  </button>
                ) : null}
              </span>
            ),
          },
        ]}
        footer={<Pager meta={list.meta} onPage={(page) => set({ page })} />}
      />
      {adjust ? <AdjustStock variant={adjust} onClose={() => setAdjust(null)} /> : null}
    </Guard>
  );
}
