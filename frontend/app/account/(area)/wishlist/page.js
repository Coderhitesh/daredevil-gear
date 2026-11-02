'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useMe } from '@/lib/hooks';
import { useLocalSafe } from '@/lib/store';
import { ProductGrid } from '@/components/product/ProductCard';

export default function WishlistPage() {
  const { data: me } = useMe();
  const localIds = useLocalSafe((s) => s.wishlist);
  const { data: products, isLoading } = useQuery({
    queryKey: ['wishlist', me ? 'server' : localIds.join(',')],
    queryFn: () => (me ? api('/wishlist') : localIds.length ? api(`/products?ids=${localIds.join(',')}&limit=50`).then((r) => r.data) : []),
  });
  if (isLoading) return <div className="skeleton h-64" />;
  if (!products?.length) {
    return (
      <div className="panel flex flex-col items-start gap-3 p-8">
        <Heart size={30} strokeWidth={1.25} className="text-graphite-400" />
        <h2 className="font-display text-2xl">Nothing saved yet</h2>
        <p className="text-graphite">Tap the heart on any product to save it for later.</p>
        <Link href="/shop" className="btn-dark mt-2">
          Browse products
        </Link>
      </div>
    );
  }
  return (
    <div>
      {!me ? (
        <p className="mb-6 text-graphite">
          Saved on this device. <Link href="/account/login?next=/account/wishlist" className="link">Sign in</Link> to keep your wishlist across devices.
        </p>
      ) : null}
      <ProductGrid products={products} cols="grid-cols-2 md:grid-cols-3" />
    </div>
  );
}
