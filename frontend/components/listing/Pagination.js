import Link from 'next/link';

export default function Pagination({ meta, basePath, searchParams = {} }) {
  if (!meta || meta.totalPages <= 1) return null;
  const href = (page) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (k !== 'page' && v) qs.set(k, String(v));
    if (page > 1) qs.set('page', String(page));
    const s = qs.toString();
    return `${basePath}${s ? `?${s}` : ''}`;
  };
  const pages = [];
  for (let p = 1; p <= meta.totalPages; p++) {
    if (p === 1 || p === meta.totalPages || Math.abs(p - meta.page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }
  const cell = 'inline-flex h-10 min-w-10 items-center justify-center rounded border px-3 text-sm';
  return (
    <nav aria-label="Pagination" className="mt-14 flex flex-wrap items-center justify-center gap-2">
      {meta.page > 1 ? (
        <Link href={href(meta.page - 1)} className={`${cell} border-stone-400 hover:border-graphite`} rel="prev">
          Previous
        </Link>
      ) : null}
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="px-1 text-graphite-400">
            …
          </span>
        ) : (
          <Link key={p} href={href(p)} aria-current={p === meta.page ? 'page' : undefined} className={`${cell} tabular ${p === meta.page ? 'border-graphite bg-graphite text-white' : 'border-stone-400 hover:border-graphite'}`}>
            {p}
          </Link>
        )
      )}
      {meta.page < meta.totalPages ? (
        <Link href={href(meta.page + 1)} className={`${cell} border-stone-400 hover:border-graphite`} rel="next">
          Next
        </Link>
      ) : null}
    </nav>
  );
}
