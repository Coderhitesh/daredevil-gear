'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useMe } from '@/lib/hooks';
import { inr } from '@/lib/format';

export default function SuccessView() {
  const params = useSearchParams();
  const orderNumber = params.get('order');
  const isCodParam = params.get('cod') === '1';
  const { data: me } = useMe();
  const token = typeof window !== 'undefined' && orderNumber ? sessionStorage.getItem(`ddg-order-${orderNumber}`) : null;
  const { data: order } = useQuery({
    queryKey: ['order', orderNumber],
    enabled: Boolean(orderNumber),
    queryFn: () => api(`/orders/${orderNumber}`, { headers: token ? { 'x-ddg-order-token': token } : {} }),
  });

  const isCod = order ? order.payment?.provider === 'cod' && order.payment?.status === 'cod_pending' : isCodParam;

  return (
    <div className="wrap max-w-2xl pt-16">
      <CheckCircle2 size={44} strokeWidth={1.5} className="text-okay" />
      <h1 className="mt-4 font-display text-display-lg">Thank you — your order is confirmed</h1>
      <p className="mt-3 text-lg text-graphite">
        Order <strong className="text-ink">{orderNumber}</strong>. We have emailed your confirmation{order ? ` to ${order.email}` : ''} and will email again when it ships.
        {isCod ? ` Please keep ${order ? inr(order.pricing.grandTotal) : 'the amount'} ready in cash or UPI for the courier.` : ''}
      </p>
      {order ? (
        <div className="panel mt-8 p-5">
          <ul className="divide-y divide-stone-300">
            {order.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-4 py-2 text-[15px]">
                <span>
                  {i.name} × {i.quantity}
                </span>
                <span className="tabular">{inr(i.netTotal)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between border-t border-stone-300 pt-3 font-medium">
            <span>{isCod ? 'Pay on delivery' : 'Total paid'}</span>
            <span className="tabular">{inr(order.pricing.grandTotal)}</span>
          </p>
        </div>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-3">
        {me ? (
          <Link href={`/account/orders/${orderNumber}`} className="btn-dark">
            View order
          </Link>
        ) : (
          <Link href={`/track-order?order=${orderNumber}`} className="btn-dark">
            Track this order
          </Link>
        )}
        <Link href="/shop" className="btn-outline">
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
