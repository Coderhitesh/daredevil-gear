'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useToast } from '@/components/ui/Toast';

export function useAdmin() {
  return useQuery({
    queryKey: ['admin-me'],
    queryFn: () => api('/auth/me').then((d) => d.user),
    staleTime: 60_000,
    retry: false,
  });
}

export function useCan() {
  const { data } = useAdmin();
  return useCallback((perm) => Boolean(data?.permissions?.includes(perm)), [data]);
}

/** URL-backed filter state: list pages are linkable and survive reloads. */
export function useUrlState(defaults = {}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const state = useMemo(() => {
    const out = { ...defaults };
    params.forEach((v, k) => (out[k] = v));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const set = useCallback(
    (patch) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === '' || v === defaults[k]) next.delete(k);
        else next.set(k, String(v));
      }
      if (!('page' in patch)) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, pathname, router]
  );
  return [state, set];
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Paged list: returns { items, meta, isLoading, error, refetch }. */
export function useList(path, query = {}, opts = {}) {
  const q = useQuery({
    queryKey: [path, query],
    queryFn: () => api(path, { query }),
    placeholderData: (prev) => prev,
    ...opts,
  });
  const d = q.data;
  const items = Array.isArray(d) ? d : d?.data || [];
  return { ...q, items, meta: Array.isArray(d) ? null : d?.meta };
}

/** Mutation wrapper: toasts errors, invalidates keys, optional success message. */
export function useAction(fn, { invalidate = [], success, onSuccess, onError } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (data, vars) => {
      await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: Array.isArray(k) ? k : [k] })));
      if (success) toast.show(typeof success === 'function' ? success(data, vars) : success);
      onSuccess?.(data, vars);
    },
    onError: (err, vars) => {
      if (onError?.(err, vars) === true) return; // handled (e.g. field errors)
      toast.show(err.message, 'error');
    },
  });
}
