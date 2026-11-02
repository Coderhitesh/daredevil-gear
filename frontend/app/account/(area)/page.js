'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useMe } from '@/lib/hooks';
import { inr, date } from '@/lib/format';
import StatusBadge from '@/components/ui/StatusBadge';

export default function AccountOverview() {
  const { data: me } = useMe();
  const { data: orders } = useQuery({ queryKey: ['orders', 1], queryFn: () => api('/orders?limit=3') });
  const { data: addresses } = useQuery({ queryKey: ['addresses'], queryFn: () => api('/addresses') });
  const recent = orders?.data || [];
  return (
    <div className="space-y-8">
      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Recent orders</h2>
          <Link href="/account/orders" className="link text-sm">
            All orders
          </Link>
        </div>
        {recent.length ? (
          <ul className="mt-4 divide-y divide-stone-300">
            {recent.map((o) => (
              <li key={o.orderNumber}>
                <Link href={`/account/orders/${o.orderNumber}`} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-stone-200/50">
                  <span>
                    <span className="font-medium">{o.orderNumber}</span>
                    <span className="block text-sm text-graphite">
                      {date(o.createdAt)}, {o.itemCount} item{o.itemCount > 1 ? 's' : ''}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <StatusBadge status={o.status} label={o.statusLabel} />
                    <span className="tabular font-medium">{inr(o.total)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-graphite">
            No orders yet. <Link href="/shop" className="link">Start shopping</Link>
          </p>
        )}
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-display text-2xl">Profile</h2>
          <p className="mt-3 text-graphite">
            {me?.name}
            <br />
            {me?.email}
            {me?.phone ? (
              <>
                <br />
                {me.phone}
              </>
            ) : null}
          </p>
          <Link href="/account/profile" className="link mt-3 inline-block text-sm">
            Edit profile
          </Link>
        </section>
        <section className="panel p-5">
          <h2 className="font-display text-2xl">Addresses</h2>
          <p className="mt-3 text-graphite">{addresses?.length ? `${addresses.length} saved address${addresses.length > 1 ? 'es' : ''}` : 'No saved addresses yet.'}</p>
          <Link href="/account/addresses" className="link mt-3 inline-block text-sm">
            Manage addresses
          </Link>
        </section>
      </div>
    </div>
  );
}
