import Link from 'next/link';
import { BadgeCheck } from 'lucide-react';
import Stars from '../product/Stars';
import SectionHead from './SectionHead';

/** Genuine, moderated reviews only. The API omits this section entirely when there are none. */
export default function ReviewsStrip({ title, subtitle, reviews = [] }) {
  if (!reviews.length) return null;
  return (
    <section className="wrap mt-20">
      <SectionHead kicker="Customer reviews" title={title} subtitle={subtitle} />
      <ul className="grid gap-5 md:grid-cols-3">
        {reviews.slice(0, 3).map((r, k) => (
          <li key={r.id} className="reveal panel flex flex-col p-6" style={{ '--i': k }}>
            <Stars value={r.rating} />
            {r.title ? <p className="mt-3 font-display font-semibold text-ink">{r.title}</p> : null}
            <p className="mt-2 line-clamp-5 text-graphite">{r.body}</p>
            <p className="mt-auto pt-5 text-[13px] text-graphite-400">
              <span className="font-medium text-ink">{r.author}</span>
              {r.verifiedPurchase ? (
                <span className="ml-2 inline-flex items-center gap-1 text-okay">
                  <BadgeCheck size={14} aria-hidden="true" /> Verified purchase
                </span>
              ) : null}
              <span className="mt-1 block">
                on{' '}
                <Link href={`/product/${r.product.slug}`} className="link">
                  {r.product.name}
                </Link>
              </span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
