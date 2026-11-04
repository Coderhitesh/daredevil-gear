'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Menu as MenuIcon, X, KeyRound, ExternalLink, ClipboardCheck } from 'lucide-react';
import { NAV, isActive } from './nav';
import { api } from '@/lib/api';
import { useAdmin } from '@/lib/hooks';
import { humanize, storefrontUrl } from '@/lib/format';
import { Spinner } from '@/components/ui';

function Sidebar({ me, onNavigate }) {
  const pathname = usePathname();
  const perms = new Set(me.permissions || []);
  return (
    <nav aria-label="Admin" className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pb-4 pt-4">
        <span className="rounded bg-white px-2 py-1.5">
          <Image src="/brand/logo_theme2.png" alt="DareDevil Gears" width={132} height={36} className="h-7 w-auto" priority />
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV.map((g) => {
          const items = g.items.filter((i) => perms.has(i.perm));
          if (!items.length) return null;
          return (
            <div key={g.group} className="mt-3">
              <p className="px-2.5 pb-1 text-[11px] font-semibold text-graphite-400">{g.group}</p>
              <ul>
                {items.map((i) => {
                  const on = isActive(pathname, i.href);
                  const Icon = i.icon;
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        onClick={onNavigate}
                        aria-current={on ? 'page' : undefined}
                        className={`flex items-center gap-2.5 rounded px-2.5 py-1.5 text-[13px] ${on ? 'bg-graphite-700 font-semibold text-white' : 'text-stone-400 hover:bg-graphite-700/60 hover:text-white'}`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${on ? 'text-signal' : ''}`} aria-hidden />
                        {i.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="border-t border-graphite-700 px-4 py-3 text-xs text-stone-400">
        <p className="truncate font-medium text-white">{me.name}</p>
        <p className="truncate">{humanize(me.role)}</p>
      </div>
    </nav>
  );
}

/** Persistent strip listing open launch items (unverified settings, tax review, blocking product flags). */
function ReviewStrip({ me }) {
  const allowed = me.permissions?.includes('settings:read');
  const { data: status } = useQuery({ queryKey: ['system-status'], queryFn: () => api('/system/status'), enabled: allowed, staleTime: 60_000 });
  const { data: summary } = useQuery({ queryKey: ['products-summary'], queryFn: () => api('/products/summary'), enabled: me.permissions?.includes('products:read'), staleTime: 60_000 });
  const open = (status?.pendingReview?.length || 0) + (status && !status.taxReviewed ? 1 : 0) + (summary?.blocking ? 1 : 0) + (status && !status.integrations.razorpay ? 1 : 0);
  if (!allowed || !status || !open) return null;
  return (
    <Link href="/system" className="flex items-center gap-2 border-b border-caution/20 bg-caution-light px-4 py-2 text-[13px] text-caution hover:underline lg:px-6">
      <ClipboardCheck className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        <strong>{open} launch item{open === 1 ? '' : 's'} open</strong>
        <span className="text-graphite">
          {' '}
          — business details, tax review{summary?.blocking ? `, ${summary.blocking} product${summary.blocking === 1 ? '' : 's'} with blocking flags` : ''}
          {!status.integrations.razorpay ? ', payments not configured' : ''}. Review before going live.
        </span>
      </span>
    </Link>
  );
}

export default function Shell({ children }) {
  const { data: me, isLoading, error } = useAdmin();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (me?.mfaSetupRequired) router.replace(`/mfa?next=${encodeURIComponent(pathname)}`);
  }, [me, router, pathname]);

  if (isLoading || !me || me.mfaSetupRequired) {
    return (
      <div className="flex min-h-screen items-center justify-center text-graphite-400">
        {error && error.status !== 401 ? <p className="text-alert">{error.message}</p> : <Spinner className="h-6 w-6" />}
      </div>
    );
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    qc.clear();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 bg-ink lg:block">
        <Sidebar me={me} />
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 bg-ink/50 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-64 bg-ink" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="absolute right-3 top-3 text-white" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            <Sidebar me={me} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}
      <div className="sticky top-0 z-20 bg-paper/95 backdrop-blur">
        <header className="flex h-12 items-center justify-between gap-3 border-b border-stone-300 px-4 lg:px-6">
          <button type="button" className="btn-ghost -ml-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <MenuIcon className="h-5 w-5" />
          </button>
          <span className="hidden text-xs text-graphite-400 sm:block">Store admin</span>
          <div className="ml-auto flex items-center gap-1">
            <a href={storefrontUrl('/')} target="_blank" rel="noreferrer" className="btn-ghost text-xs">
              <ExternalLink className="h-3.5 w-3.5" /> View store
            </a>
            <Link href="/account" className="btn-ghost text-xs">
              <KeyRound className="h-3.5 w-3.5" /> My account
            </Link>
            <button type="button" className="btn-ghost text-xs" onClick={logout}>
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </header>
        <ReviewStrip me={me} />
      </div>
      <main className="px-4 py-6 lg:px-6">{children}</main>
    </div>
  );
}
