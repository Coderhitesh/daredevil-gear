import 'server-only';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

const API = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';

/**
 * Server-side fetch for PUBLIC data only (catalogue, CMS). Never forwards customer cookies,
 * so responses are safe to cache with ISR.
 */
export async function apiGet(path, { revalidate = 60, tags, allow404 = false } = {}) {
  let res;
  try {
    res = await fetch(`${API}/api/v1${path}`, { next: { revalidate, tags }, headers: { Accept: 'application/json' } });
  } catch (err) {
    // During `next build` without a reachable API (e.g. inside a Docker build) skip prerendering:
    // the route renders on demand instead, and fetches still use the data cache.
    if (process.env.NEXT_PHASE === 'phase-production-build') await connection();
    throw new Error(`API unreachable: ${err.message}`);
  }
  if (res.status === 404) {
    if (allow404) return null;
    notFound();
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) throw new Error(body?.error?.message || `API error ${res.status} on ${path}`);
  return body.meta ? { data: body.data, meta: body.meta } : body.data;
}

// SITE_URL is read at runtime; NEXT_PUBLIC_SITE_URL is inlined at build time (fallback).
export const siteUrl = () => (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

export async function getShell() {
  return apiGet('/storefront/shell', { revalidate: 60, tags: ['shell'] });
}
