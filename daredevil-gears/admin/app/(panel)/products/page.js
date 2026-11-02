'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Download, FileUp, AlertOctagon, ImageOff } from 'lucide-react';
import { api, download } from '@/lib/api';
import { useCan, useList, useUrlState } from '@/lib/hooks';
import { inr, ago } from '@/lib/format';
import { PageHeader, DataTable, Pager, Toolbar, SearchInput, FilterSelect, Status, Pill, Tabs } from '@/components/ui';
import Guard from '@/components/shell/Guard';
import { useToast } from '@/components/ui/Toast';

export default function ProductsPage() {
  const can = useCan();
  const router = useRouter();
  const toast = useToast();
  const [state, set] = useUrlState({ sort: 'updated' });
  const list = useList('/products', { ...state, limit: 50 });
  const { data: summary } = useQuery({ queryKey: ['products-summary'], queryFn: () => api('/products/summary') });
  const { data: cats = [] } = useQuery({ queryKey: ['/categories', 'all'], queryFn: () => api('/categories', { query: { limit: 200 } }).then((r) => r.data) });

  const tab = state.flags === 'blocking' ? 'blocking' : state.status || 'all';
  const setTab = (t) => set(t === 'blocking' ? { flags: 'blocking', status: '' } : { status: t === 'all' ? '' : t, flags: '' });

  return (
    <Guard perm="products:read">
      <PageHeader
        title="Products"
        description="Prices are GST inclusive. A product can only be published once its blocking compliance flags are resolved."
        actions={
          <>
            <button type="button" className="btn-outline" onClick={() => download('/products/export', 'products.csv').catch((e) => toast.show(e.message, 'error'))}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
            {can('products:import') ? (
              <Link href="/products/import" className="btn-outline">
                <FileUp className="h-4 w-4" /> Import
              </Link>
            ) : null}
            {can('products:write') ? (
              <Link href="/products/new" className="btn-primary">
                <Plus className="h-4 w-4" /> New product
              </Link>
            ) : null}
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ['all', `All${summary ? ` (${summary.total})` : ''}`],
          ['published', `Published${summary ? ` (${summary.byStatus.published})` : ''}`],
          ['review', `In review${summary ? ` (${summary.byStatus.review})` : ''}`],
          ['draft', `Draft${summary ? ` (${summary.byStatus.draft})` : ''}`],
          ['archived', `Archived${summary ? ` (${summary.byStatus.archived})` : ''}`],
          ['blocking', 'Blocking flags', summary?.blocking || null],
        ]}
      />
      {summary && (summary.missingImages || summary.missingStatutory || summary.outOfStock) ? (
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {summary.missingImages ? <Pill tone="caution"><ImageOff className="h-3 w-3" /> {summary.missingImages} without photos</Pill> : null}
          {summary.missingStatutory ? <Pill tone="caution"><AlertOctagon className="h-3 w-3" /> {summary.missingStatutory} missing Legal Metrology details</Pill> : null}
          {summary.outOfStock ? (
            <button type="button" onClick={() => set({ stock: 'out' })}>
              <Pill tone="alert">{summary.outOfStock} published but out of stock</Pill>
            </button>
          ) : null}
        </div>
      ) : null}
      <Toolbar>
        <SearchInput value={state.q} onChange={(q) => set({ q })} placeholder="Name, SKU or slug" />
        <FilterSelect label="Category" value={state.category} onChange={(category) => set({ category })} options={cats.map((c) => [String(c._id), c.name])} />
        <FilterSelect label="Stock" value={state.stock} onChange={(stock) => set({ stock })} options={[['out', 'Out of stock']]} />
        <label className="ml-auto flex items-center gap-2 text-sm text-graphite-600">
          Sort
          <select className="input w-auto" value={state.sort} onChange={(e) => set({ sort: e.target.value })}>
            <option value="updated">Recently updated</option>
            <option value="name">Name</option>
            <option value="price">Price, low to high</option>
            <option value="stock">Stock, lowest first</option>
          </select>
        </label>
      </Toolbar>
      <DataTable
        rows={list.items}
        isLoading={list.isLoading}
        error={list.error}
        onRowClick={(r) => router.push(`/products/${r._id}`)}
        columns={[
          {
            key: 'name',
            label: 'Product',
            render: (r) => (
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-stone-200 text-[10px] text-graphite-400">
                  {r.image ? <img src={r.image} alt="" className="h-full w-full object-cover" /> : 'No photo'}
                </span>
                <span className="min-w-0">
                  <Link href={`/products/${r._id}`} className="block truncate font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                    {r.name}
                  </Link>
                  <span className="text-xs text-graphite-400">{r.sku}</span>
                </span>
              </div>
            ),
          },
          { key: 'category', label: 'Category', render: (r) => r.category?.name || '—' },
          {
            key: 'price',
            label: 'Price',
            align: 'right',
            render: (r) => (
              <>
                {inr(r.pricing?.priceInclusive)}
                <span className="block text-xs text-graphite-400">{r.pricing?.gstRule === 'apparel_threshold' ? 'GST 5/18%' : `GST ${r.pricing?.gstRate}%`}</span>
              </>
            ),
          },
          { key: 'stock', label: 'Available', align: 'right', render: (r) => (r.availableQty > 0 ? r.availableQty : <span className="text-alert">0</span>) },
          {
            key: 'flags',
            label: 'Checks',
            render: (r) =>
              r.blockingFlags ? <Pill tone="alert">{r.blockingFlags} blocking</Pill> : r.warningFlags ? <Pill tone="caution">{r.warningFlags} warning{r.warningFlags > 1 ? 's' : ''}</Pill> : <Pill tone="okay">Clear</Pill>,
          },
          { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
          { key: 'updatedAt', label: 'Updated', render: (r) => <span className="text-graphite-400">{ago(r.updatedAt)}</span> },
        ]}
        footer={<Pager meta={list.meta} onPage={(page) => set({ page })} />}
      />
    </Guard>
  );
}
