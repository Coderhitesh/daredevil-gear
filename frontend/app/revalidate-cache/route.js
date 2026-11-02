import { revalidatePath, revalidateTag } from 'next/cache';

/**
 * Called by the API right after an admin changes banners, homepage sections, offers, settings or the
 * catalogue, so the storefront shows the change at once instead of after its 60-second cache.
 * Protected by REVALIDATE_SECRET (same value in backend/.env and frontend/.env.local).
 */
export async function POST(req) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get('x-revalidate-secret') !== secret) return Response.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const tags = Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === 'string').slice(0, 20) : [];
  for (const t of tags) revalidateTag(t);
  // every page shares the layout data (header, footer, announcement); refresh them all
  revalidatePath('/', 'layout');
  return Response.json({ ok: true, tags });
}
