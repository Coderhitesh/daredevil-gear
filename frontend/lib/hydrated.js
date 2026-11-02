'use client';

import { useSyncExternalStore } from 'react';

const noSubscribe = () => () => {};

/**
 * false while React hydrates server HTML (including streamed sections that hydrate late),
 * true afterwards and immediately for client-side mounts.
 */
export function useHydrated() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}
