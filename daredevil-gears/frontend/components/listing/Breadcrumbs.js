import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { siteUrl } from '@/lib/api-server';

/** Visible breadcrumbs + BreadcrumbList structured data. items: [{ name, href }] (last = current page) */
export default function Breadcrumbs({ items }) {
  const all = [{ name: 'Home', href: '/' }, ...items];
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: all.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${siteUrl()}${it.href}` })),
  };
  return (
    <nav aria-label="Breadcrumb" className="text-[13px] text-graphite-400">
      <ol className="flex flex-wrap items-center gap-1">
        {all.map((it, i) => (
          <li key={it.href} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight size={13} aria-hidden="true" /> : null}
            {i === all.length - 1 ? (
              <span aria-current="page" className="text-graphite">
                {it.name}
              </span>
            ) : (
              <Link href={it.href} className="hover:text-ink hover:underline">
                {it.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
    </nav>
  );
}
