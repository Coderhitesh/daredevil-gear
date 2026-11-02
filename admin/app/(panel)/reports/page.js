'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, download } from '@/lib/api';
import { PageHeader, Card, Empty, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import Guard from '@/components/shell/Guard';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export default function ReportsPage() {
  const toast = useToast();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(null);
  const search = useQuery({ queryKey: ['/reports/search'], queryFn: () => api('/reports/search', { query: { days: 30 } }) });

  async function get(path, name) {
    setBusy(name);
    try {
      await download(path, name);
    } catch (e) {
      toast.show(e.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Guard perm="reports:read">
      <PageHeader title="Reports" description="Exports open in any spreadsheet. Amounts are in rupees; dates are in Indian time." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Sales & GST">
          <p className="mb-4 text-sm text-graphite-600">One row per order line for paid orders: invoice number, HSN, GST rate, taxable value and tax, place of supply. Share with your accountant for GST returns.</p>
          <div className="flex flex-wrap items-end gap-3">
            <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <button type="button" className="btn-dark" disabled={busy === 'sales'} onClick={() => get(`/reports/sales.csv?from=${from}&to=${to}`, 'sales')}>
              <Download className="h-4 w-4" /> Sales CSV
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-300 pt-4">
            <button type="button" className="btn-outline" disabled={busy === 'orders'} onClick={() => get(`/orders/export?from=${from}`, 'orders')}>
              <Download className="h-4 w-4" /> Orders CSV (from date)
            </button>
            <button type="button" className="btn-outline" disabled={busy === 'products'} onClick={() => get('/products/export', 'products')}>
              <Download className="h-4 w-4" /> Products & stock CSV
            </button>
          </div>
        </Card>
        <Card title="Search, last 30 days">
          {search.data?.totalSearches ? (
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium">Most searched</p>
                <ol className="space-y-1 text-sm">
                  {search.data.top.slice(0, 12).map((t) => (
                    <li key={t.term} className="flex justify-between gap-2">
                      <span className="truncate">{t.term}</span>
                      <span className="tabular text-graphite-400">{t.searches}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Searches with no results</p>
                {search.data.zeroResults.length ? (
                  <ol className="space-y-1 text-sm">
                    {search.data.zeroResults.slice(0, 12).map((t) => (
                      <li key={t.term} className="flex justify-between gap-2">
                        <span className="truncate">{t.term}</span>
                        <span className="tabular text-alert">{t.zeroResults}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-graphite-400">None — every search found something.</p>
                )}
                <p className="hint mt-3">Add these words as product tags, or stock what people are looking for.</p>
              </div>
            </div>
          ) : (
            <Empty title="No searches recorded yet" />
          )}
        </Card>
      </div>
    </Guard>
  );
}
