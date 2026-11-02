'use client';

import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { useLocal } from '@/lib/store';

export default function Providers({ children }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: (count, err) => count < 1 && err?.status >= 500, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        {/* must stay before {children}: sibling effects run in order, so stored wishlist/recent items load before any child writes to them */}
        <LocalStoreHydrator />
        <FocusVisibleFix />
        {children}
      </MotionConfig>
    </QueryClientProvider>
  );
}

function FocusVisibleFix() {
  // keep the page scrollable when a drawer unmounts unexpectedly (e.g. route change)
  useEffect(() => () => document.body.style.removeProperty('overflow'), []);
  return null;
}

function LocalStoreHydrator() {
  // localStorage is read only after hydration so guest wishlist hearts etc. match the server HTML
  useEffect(() => {
    useLocal.persist.rehydrate();
  }, []);
  return null;
}
