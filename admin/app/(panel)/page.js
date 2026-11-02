'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useUrlState } from '@/lib/hooks';
import { inr, ago, ORDER_STATUS_LABEL } from '@/lib/format';
import { PageHeader, Card, Status, Empty, Notice } from '@/components/ui';
import Guard from '@/components/shell/Guard';
import BarTrend from '@/components/charts/BarTrend';
import HBars from '@/components/charts/HBars';

const RANGES = [
  ['7', 'Last 7 days'],
  ['30', 'Last 30 days'],
  ['90', 'Last 90 days'],
  ['365', 'Last 12 months'],
];

function Stat({ label, value, sub }) {
  return (
    <div className="card px-4 py-3.5">
      <p className="text-xs text-graphite-400">{label}</p>
      <p className="mt-1 font-display text-[1.9rem] font-semibold leading-none tabular">{value}</p>
      {sub ? <p className="mt-1.5 text-xs text-graphite-600">{sub}</p> : null}
    </div>
  );
}

export default function DashboardPage() {
  const [state, set] = useUrlState({ days: '30' });
  const { data: d, isLoading, error } = useQuery({ queryKey: ['dashboard', state.days], queryFn: () => api('/dashboard', { query: { days: state.days } }) });

  return (
    <Guard perm="dashboard:read">
      <PageHeader
        title="Dashboard"
        description="Paid orders only. Refunds are subtracted from revenue."
        actions={
          <select className="input w-auto" value={state.days} onChange={(e) => set({ days: e.target.value })} aria-label="Date range">
            {RANGES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        }
      />
      {error ? <Notice tone="alert" title="Could not load the dashboard">{error.message}</Notice> : null}
      {isLoading || !d ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Net revenue" value={inr(d.revenue, { decimals: 0 })} sub={d.refunded ? `${inr(d.grossRevenue, { decimals: 0 })} gross, ${inr(d.refunded, { decimals: 0 })} refunded` : 'No refunds in this period'} />
            <Stat label="Paid orders" value={d.ordersPlaced} sub={`Average order ${inr(d.averageOrderValue, { decimals: 0 })}`} />
            <Stat label="To fulfil" value={d.pendingOrders} sub={<Link className="link" href="/orders?status=confirmed,processing">Open the queue</Link>} />
            <Stat label="Customers" value={d.customers.total} sub={`${d.customers.new} new in this period`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card title="Revenue by day" className="xl:col-span-2">
              <BarTrend data={d.revenueTrend} valueKey="revenue" label="Net revenue" format={(v, axis) => (axis ? compactINR(v) : inr(v, { decimals: 0 }))} />
            </Card>
            <Card title="Payments">
              {d.payments.attempts ? (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-graphite-600">Success rate</span>
                    <span className="font-display text-3xl font-semibold tabular">{d.payments.successRate}%</span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded bg-stone-200" aria-hidden>
                    <span className="bg-okay" style={{ width: `${(d.payments.succeeded / d.payments.attempts) * 100}%` }} />
                    <span className="ml-0.5 bg-alert" style={{ width: `${(d.payments.failed / d.payments.attempts) * 100}%` }} />
                  </div>
                  <ul className="space-y-1 text-sm">
                    <li className="flex justify-between"><span className="text-graphite-600">Attempts</span><span className="tabular">{d.payments.attempts}</span></li>
                    <li className="flex justify-between"><span className="text-graphite-600">Succeeded</span><span className="tabular">{d.payments.succeeded}</span></li>
                    <li className="flex justify-between"><span className="text-graphite-600">Failed</span><span className="tabular">{d.payments.failed}</span></li>
                    <li className="flex justify-between"><span className="text-graphite-600">Cancelled orders</span><span className="tabular">{d.cancelledOrders}</span></li>
                  </ul>
                  <Link href="/payments?status=failed" className="link text-sm">See failed payments</Link>
                </div>
              ) : (
                <Empty title="No payment attempts yet" />
              )}
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card title="Recent orders" className="xl:col-span-2" bodyClass="" actions={<Link href="/orders" className="btn-ghost btn-xs">All orders</Link>}>
              {d.recentOrders.length ? (
                <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Status</th>
                        <th className="text-right">Total</th>
                        <th className="text-right">Placed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.recentOrders.map((o) => (
                        <tr key={o.id}>
                          <td><Link className="link font-medium" href={`/orders/${o.id}`}>{o.orderNumber}</Link></td>
                          <td className="max-w-[14rem] truncate">{o.customer || o.email}</td>
                          <td><Status value={o.status} label={ORDER_STATUS_LABEL[o.status]} /></td>
                          <td className="text-right tabular">{inr(o.total)}</td>
                          <td className="text-right text-graphite-400">{ago(o.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No orders yet">Orders appear here as soon as a customer reaches payment.</Empty>
              )}
            </Card>
            <Card title="Sales by category">
              {d.salesByCategory.length ? <HBars rows={d.salesByCategory} format={(v) => inr(v, { decimals: 0 })} /> : <Empty title="No sales in this period" />}
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card title="Top products" bodyClass="">
              {d.topProducts.length ? (
                <ul className="divide-y divide-stone-200">
                  {d.topProducts.map((p) => (
                    <li key={p.productId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0">
                        <Link href={`/products/${p.productId}`} className="link block truncate">{p.name}</Link>
                        <span className="text-xs text-graphite-400">{p.sku}</span>
                      </span>
                      <span className="text-right tabular">
                        {p.units} sold
                        <span className="block text-xs text-graphite-400">{inr(p.revenue, { decimals: 0 })}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="No sales yet" />
              )}
            </Card>
            <Card title="Low stock" bodyClass="" actions={<Link href="/inventory?low=true" className="btn-ghost btn-xs">Inventory</Link>}>
              {d.lowStock.length ? (
                <ul className="divide-y divide-stone-200">
                  {d.lowStock.map((v) => (
                    <li key={v.variantId} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 truncate">{v.name} <span className="text-xs text-graphite-400">{v.sku}</span></span>
                      <span className="tabular text-caution">{v.available} left</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="Nothing running low" />
              )}
            </Card>
            <Card title="Out of stock (published)" bodyClass="">
              {d.outOfStock.length ? (
                <ul className="max-h-80 divide-y divide-stone-200 overflow-y-auto">
                  {d.outOfStock.map((p) => (
                    <li key={p.productId} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                      <Link href={`/products/${p.productId}`} className="link min-w-0 truncate">{p.name}</Link>
                      <span className="shrink-0 text-xs text-graphite-400">{p.sku}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="Every published product is in stock" />
              )}
            </Card>
          </div>
        </div>
      )}
    </Guard>
  );
}

function compactINR(paise) {
  const r = paise / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(1)}Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)}L`;
  if (r >= 1e3) return `₹${(r / 1e3).toFixed(0)}k`;
  return `₹${Math.round(r)}`;
}
