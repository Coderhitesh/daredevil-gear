import Link from 'next/link';
import Image from 'next/image';
import { Star } from 'lucide-react';
import WishlistButton from './WishlistButton';
import AddToCartButton from './AddToCartButton';
import { Placeholder } from './ProductThumb';
import { inr } from '@/lib/format';

/**
 * Product card. Badges are only ever factual: a sale badge for a genuine admin-set sale,
 * "New" only inside the new-arrivals rail, stars only when real approved reviews exist.
 */
export default function ProductCard({ product, priority = false, markNew = false }) {
  const p = product;
  return (
    <article className="group relative flex h-full flex-col rounded-2xl border border-stone-300/70 bg-white p-3 shadow-card transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-1 hover:shadow-lift motion-reduce:hover:translate-y-0">
      <Link href={`/product/${p.slug}`} className="flex flex-1 flex-col focus-visible:outline-offset-4">
        <div className="relative aspect-square overflow-hidden rounded-xl bg-stone-100">
          {p.image?.url ? (
            <Image src={p.image.url} alt={p.image.alt || p.name} fill priority={priority} sizes="(min-width:1280px) 22vw, (min-width:768px) 30vw, 48vw" className="object-contain p-3 transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <Placeholder name={p.name} />
          )}
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {p.onSale ? <span className="badge bg-signal text-white">-{p.discountPct}%</span> : null}
            {markNew && !p.onSale ? <span className="badge bg-okay text-white">New</span> : null}
            {!p.inStock ? <span className="badge bg-white/95 text-graphite ring-1 ring-stone-300">Out of stock</span> : null}
          </div>
        </div>
        <div className="mt-3 flex flex-1 flex-col px-1">
          {p.rating ? (
            <p className="mb-1 flex items-center gap-1 text-[12.5px] text-graphite-400" aria-label={`Rated ${p.rating.average} out of 5 from ${p.rating.count} reviews`}>
              <span className="flex" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={13} className={n <= Math.round(p.rating.average) ? 'fill-[#F5A524] text-[#F5A524]' : 'fill-stone-300 text-stone-300'} />
                ))}
              </span>
              <span className="tabular">({p.rating.average})</span>
            </p>
          ) : (
            <p className="mb-1 text-[12px] text-graphite-400">{p.category?.name || ' '}</p>
          )}
          <h3 className="line-clamp-2 min-h-[2.6em] text-[14.5px] font-medium leading-snug text-ink group-hover:text-signal-dark">{p.name}</h3>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="tabular font-display text-[1.15rem] font-bold text-ink">{inr(p.price)}</span>
            {p.onSale && p.regularPrice > p.price ? (
              <s className="tabular text-[13px] text-graphite-400" aria-label={`Regular price ${inr(p.regularPrice)}`}>
                {inr(p.regularPrice)}
              </s>
            ) : null}
          </div>
          {p.minAge >= 18 ? <p className="mt-1 text-[11.5px] font-medium text-olive">18+ only, India delivery</p> : null}
        </div>
      </Link>
      <div className="mt-3">
        <AddToCartButton productId={p.id} inStock={p.inStock} name={p.name} image={p.image?.url} />
      </div>
      <WishlistButton productId={p.id} name={p.name} className="absolute right-5 top-5 h-8 w-8 rounded-full bg-white text-graphite shadow-card hover:text-signal" />
    </article>
  );
}

export function ProductGrid({ products, priorityCount = 0, cols = 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4' }) {
  return (
    <ul className={`grid ${cols} gap-3 sm:gap-5`}>
      {products.map((p, i) => (
        <li key={p.id} className={i < priorityCount ? undefined : 'reveal'} style={{ '--i': i % 4 }}>
          <ProductCard product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ n = 8 }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="rounded-2xl border border-stone-300/70 bg-white p-3">
          <div className="skeleton aspect-square" />
          <div className="skeleton mt-3 h-3 w-1/3" />
          <div className="skeleton mt-2 h-4 w-4/5" />
          <div className="skeleton mt-2 h-5 w-1/4" />
          <div className="skeleton mt-3 h-9 w-full" />
        </li>
      ))}
    </ul>
  );
}
