'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';

export default function Providers({ children }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: (n, err) => n < 1 && err?.status >= 500, refetchOnWindowFocus: false, staleTime: 15_000 },
          mutations: { retry: false },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
