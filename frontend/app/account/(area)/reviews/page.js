'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import Stars from '@/components/product/Stars';
import { date } from '@/lib/format';

const STATUS = { pending: 'Awaiting moderation', approved: 'Published', rejected: 'Not published' };

export default function MyReviews() {
  const { data = [], isLoading } = useQuery({ queryKey: ['my-reviews'], queryFn: () => api('/users/me/reviews') });
  if (isLoading) return <div className="skeleton h-40" />;
  if (!data.length) return <p className="panel p-6 text-graphite">You have not written any reviews yet. You can review products after they are delivered — open the product page and choose “Write a review”.</p>;
  return (
    <ul className="space-y-3">
      {data.map((r) => (
        <li key={r.id} className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {r.product ? (
              <Link href={`/product/${r.product.slug}`} className="font-medium hover:underline">
                {r.product.name}
              </Link>
            ) : null}
            <span className="tag-muted">{STATUS[r.status]}</span>
          </div>
          <div className="mt-2">
            <Stars value={r.rating} size={14} />
          </div>
          {r.title ? <p className="mt-2 font-medium">{r.title}</p> : null}
          <p className="mt-1 text-graphite">{r.body}</p>
          <p className="mt-2 text-sm text-graphite-400">{date(r.createdAt)}</p>
        </li>
      ))}
    </ul>
  );
}
