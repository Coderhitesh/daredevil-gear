'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import OrderDetail from '@/components/order/OrderDetail';

export default function OrderPage({ params }) {
  const { orderNumber } = use(params);
  const { data, isLoading, error } = useQuery({ queryKey: ['order', orderNumber], queryFn: () => api(`/orders/${orderNumber}`) });
  if (isLoading) return <div className="skeleton h-96" />;
  if (error) {
    return (
      <div className="panel p-6">
        <p>{error.status === 404 ? 'We could not find that order in your account.' : error.message}</p>
        <Link href="/account/orders" className="link mt-3 inline-block">
          Back to orders
        </Link>
      </div>
    );
  }
  return (
    <div>
      <Link href="/account/orders" className="link mb-4 inline-block text-sm">
        All orders
      </Link>
      <OrderDetail order={data} />
    </div>
  );
}
