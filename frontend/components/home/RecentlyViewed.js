'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { useLocalSafe } from '@/lib/store';
import ProductRail from './ProductRail';

export default function RecentlyViewed({ title = 'Recently viewed', excludeId }) {
  const ids = useLocalSafe((s) => s.recentlyViewed).filter((id) => id !== excludeId).slice(0, 8);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { data } = useQuery({
    queryKey: ['recent', ids.join(',')],
    enabled: mounted && ids.length > 0,
    queryFn: () => api(`/products?ids=${ids.join(',')}&limit=8`).then((r) => {
      const map = new Map(r.data.map((p) => [p.id, p]));
      return ids.map((id) => map.get(id)).filter(Boolean);
    }),
  });
  if (!mounted || !data?.length) return null;
  return <ProductRail kicker="Your history" title={title} products={data} />;
}
