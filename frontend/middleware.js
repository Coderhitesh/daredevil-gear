import { NextResponse } from 'next/server';

/**
 * Admin-managed SEO redirects (301/302/410), including legacy URLs from the old OpenCart site
 * (e.g. /index.php?route=product/product&product_id=…). The redirect table is cached briefly in memory.
 */
const API = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';
let cache = { at: 0, map: new Map() };

async function redirects() {
  if (Date.now() - cache.at < 60_000) return cache.map;
  try {
    const res = await fetch(`${API}/api/v1/storefront/redirects`, { headers: { Accept: 'application/json' } });
    const body = await res.json();
    cache = { at: Date.now(), map: new Map((body.data || []).map((r) => [r.from.replace(/\/+$/, '') || '/', r])) };
  } catch {
    cache.at = Date.now() - 50_000; // retry soon
  }
  return cache.map;
}

export async function middleware(req) {
  const { pathname, search } = req.nextUrl;
  const map = await redirects();
  if (!map.size) return NextResponse.next();
  const key = pathname.replace(/\/+$/, '') || '/';
  const hit = map.get(key) || map.get(`${key}${search}`);
  if (!hit) return NextResponse.next();
  if (hit.statusCode === 410) return new NextResponse('This page has been permanently removed.', { status: 410 });
  const target = hit.to.startsWith('http') ? hit.to : new URL(hit.to, req.url);
  return NextResponse.redirect(target, hit.statusCode);
}

export const config = {
  matcher: ['/((?!api/|_next/|brand/|patterns/|icon|favicon|robots.txt|sitemap.xml).*)'],
};
