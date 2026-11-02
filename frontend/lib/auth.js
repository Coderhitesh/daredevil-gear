'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from './api-client';
import { useLocal } from './store';

/** Only allow same-site relative redirects after sign-in. */
export function safeNext(raw, fallback = '/account') {
  const v = String(raw || '');
  return v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : fallback;
}

export function useAfterSignIn() {
  const qc = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const { wishlist, setWishlist } = useLocal();
  return async (user) => {
    qc.setQueryData(['me'], user);
    if (wishlist.length) {
      await api('/wishlist/merge', { method: 'POST', body: { productIds: wishlist } }).catch(() => {});
      setWishlist([]);
    }
    qc.invalidateQueries();
    router.replace(safeNext(params.get('next')));
    router.refresh();
  };
}
