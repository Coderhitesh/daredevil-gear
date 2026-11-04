'use client';

import { useHydrated } from './hydrated';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, refreshSession } from './api-client';
import { useLocalSafe, useUi } from './store';

export { useHydrated };

/**
 * The signed-in user. While hydrating it reports "loading, no user" exactly like the server render did,
 * so streamed sections that hydrate after /auth/me has resolved do not mismatch.
 */
let wasSignedIn = false;
let triedRefresh = false;

/** /auth/me answers 200 {user:null} once the 15-min access cookie expires (no 401), so refresh the session here. */
async function fetchMe() {
  let user = (await api('/auth/me')).user;
  if (!user && (wasSignedIn || !triedRefresh)) {
    triedRefresh = true;
    if (await refreshSession()) user = (await api('/auth/me')).user;
  }
  wasSignedIn = Boolean(user);
  return user;
}

export function useMe() {
  const hydrated = useHydrated();
  const q = useQuery({ queryKey: ['me'], queryFn: fetchMe, staleTime: 60_000 });
  return hydrated ? q : { ...q, data: undefined, isLoading: true, isSuccess: false };
}

export function useCart(destination) {
  const qs = destination?.pincode ? `?pincode=${destination.pincode}&state=${encodeURIComponent(destination.state || '')}` : '';
  const hydrated = useHydrated();
  const q = useQuery({ queryKey: ['cart', destination?.pincode || null, destination?.state || null], queryFn: () => api(`/cart${qs}`), staleTime: 10_000 });
  // same as the server render until hydration ends (the header may already have fetched the cart)
  return hydrated ? q : { ...q, data: undefined, isLoading: true, isSuccess: false };
}

/** Cart mutations write the returned server view straight into the cache. */
export function useCartMutation(fn, { onSuccessMessage } = {}) {
  const qc = useQueryClient();
  const notify = useUi((s) => s.notify);
  return useMutation({
    mutationFn: fn,
    onSuccess: (view) => {
      qc.setQueryData(['cart', null, null], view);
      qc.invalidateQueries({ queryKey: ['cart'] });
      if (onSuccessMessage) notify(onSuccessMessage, 'good');
      if (view?.adjustedQuantity) notify(`Quantity adjusted to ${view.adjustedQuantity} — that is all we have in stock.`, 'warn');
    },
    onError: (err) => notify(err.message, 'bad'),
  });
}

export function useAddToCart() {
  const open = useUi((s) => s.openCart);
  const m = useCartMutation(({ productId, variantId, quantity }) => api('/cart/items', { method: 'POST', body: { productId, variantId, quantity } }));
  return { ...m, add: (args, { openDrawer = true } = {}) => m.mutateAsync(args).then((v) => (openDrawer && open(), v)) };
}

export function useWishlist() {
  const { data: me } = useMe();
  const local = useLocalSafe();
  const qc = useQueryClient();
  const server = useQuery({ queryKey: ['wishlist-ids'], enabled: Boolean(me), queryFn: () => api('/wishlist').then((items) => items.map((p) => p.id)) });
  const ids = me ? server.data || [] : local.wishlist;
  const toggle = async (id) => {
    if (!me) return local.toggleWish(id);
    const has = ids.includes(id);
    const res = has ? await api(`/wishlist/${id}`, { method: 'DELETE' }) : await api('/wishlist', { method: 'POST', body: { productId: id } });
    qc.setQueryData(['wishlist-ids'], res.productIds);
    qc.invalidateQueries({ queryKey: ['wishlist'] });
  };
  return { ids, has: (id) => ids.includes(id), toggle };
}
