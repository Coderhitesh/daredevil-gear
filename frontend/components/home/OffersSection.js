import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Tag } from 'lucide-react';
import SectionHead from './SectionHead';

const isExternal = (href) => /^https?:\/\//i.test(href || '');

/** One offer post from Admin → Banners (placement "Offer"); the whole card opens its product/link. */
function PostCard({ post, index }) {
  const href = post.linkHref || null;
  const img = post.image?.desktop;
  const body = (
    <>
      <div className="relative aspect-[4/2] overflow-hidden rounded-xl bg-night">
        {img ? (
          <Image src={img} alt={post.image?.alt || post.title} fill sizes="(min-width:1024px) 30vw, (min-width:640px) 45vw, 90vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="dusk flex h-full w-full items-end p-5" aria-hidden="true">
            <Tag size={40} strokeWidth={1.4} className="text-signal" />
          </div>
        )}
        {post.eyebrow ? <span className="badge absolute left-3 top-3 bg-signal text-white">{post.eyebrow}</span> : null}
      </div>
      <div className="flex flex-1 flex-col px-1 pb-1 pt-3">
        <h3 className="font-display text-[17px] font-semibold leading-snug text-ink group-hover:text-signal-dark">{post.title}</h3>
        {post.subtitle ? <p className="mt-1 line-clamp-3 text-[14px] text-graphite">{post.subtitle}</p> : null}
        {href ? (
          <span className="mt-auto inline-flex items-center gap-1.5 pt-3 font-display text-[14px] font-semibold text-signal-dark">
            {post.ctaLabel || 'View offer'} <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </span>
        ) : null}
      </div>
    </>
  );
  const cls = 'group flex h-full flex-col rounded-2xl border border-stone-300/70 bg-white p-3 shadow-card transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-lift';
  return (
    <li className="reveal" style={{ '--i': index }}>
      {!href ? (
        <div className={cls}>{body}</div>
      ) : isExternal(href) || post.openInNewTab ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
          {body}
        </a>
      ) : (
        <Link href={href} className={cls}>
          {body}
        </Link>
      )}
    </li>
  );
}

/** Homepage "Offers": admin-posted offers (Banners → "Homepage offer post"); each card opens its product. */
export default function OffersSection({ title, subtitle, posts = [] }) {
  if (!posts.length) return null;
  return (
    <section className="wrap mt-16 sm:mt-20 mb-20 sm:mb-20" aria-label={title || 'Offers'}>
      <SectionHead kicker="Deals" title={title || 'Offers'} subtitle={subtitle} />
      <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
        {posts.map((p, k) => (
          <PostCard key={p.id} post={p} index={k % 3} />
        ))}
      </ul>
    </section>
  );
}
