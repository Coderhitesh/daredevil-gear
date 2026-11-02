'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useHydrated } from './hydrated';

/**
 * Client UI state only. The cart, prices and stock are always loaded from the API —
 * localStorage holds just the guest wishlist, recently viewed items and recent searches.
 */
const safeStorage = createJSONStorage(() => {
  try {
    const t = '__ddg';
    window.localStorage.setItem(t, t);
    window.localStorage.removeItem(t);
    return window.localStorage;
  } catch {
    const mem = {};
    return { getItem: (k) => mem[k] ?? null, setItem: (k, v) => (mem[k] = v), removeItem: (k) => delete mem[k] };
  }
});

export const useUi = create((set) => ({
  cartOpen: false,
  menuOpen: false,
  searchOpen: false,
  toast: null,
  openCart: () => set({ cartOpen: true }),
  closeCart: () => set({ cartOpen: false }),
  setMenu: (v) => set({ menuOpen: v }),
  setSearch: (v) => set({ searchOpen: v }),
  notify: (message, tone = 'info') => set({ toast: { message, tone, id: Date.now() } }),
  clearToast: () => set({ toast: null }),
}));

const LOCAL_EMPTY = { wishlist: [], recentlyViewed: [], recentSearches: [] };

/**
 * Read the browser-stored lists in render output. Until hydration ends it returns the empty lists the
 * server rendered with, so sections that hydrate late never mismatch. Actions are always the real ones.
 */
export function useLocalSafe(selector = (s) => s) {
  const hydrated = useHydrated();
  const live = useLocal(selector);
  if (hydrated) return live;
  return selector({ ...useLocal.getState(), ...LOCAL_EMPTY });
}

export const useLocal = create(
  persist(
    (set, get) => ({
      wishlist: [], // product ids (guest); merged into the account on sign-in
      recentlyViewed: [], // product ids, newest first
      recentSearches: [],
      toggleWish: (id) => set({ wishlist: get().wishlist.includes(id) ? get().wishlist.filter((x) => x !== id) : [id, ...get().wishlist].slice(0, 100) }),
      setWishlist: (ids) => set({ wishlist: ids }),
      viewed: (id) => set({ recentlyViewed: [id, ...get().recentlyViewed.filter((x) => x !== id)].slice(0, 12) }),
      searched: (q) => {
        const term = String(q || '').trim();
        if (term.length < 2) return;
        set({ recentSearches: [term, ...get().recentSearches.filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, 6) });
      },
      clearSearches: () => set({ recentSearches: [] }),
    }),
    { name: 'ddg-local', storage: safeStorage, version: 1, skipHydration: true } // rehydrated after mount in Providers (avoids SSR mismatch)
  )
);
