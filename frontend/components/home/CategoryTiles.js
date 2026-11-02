import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import SectionHead from './SectionHead';
import { plural } from '@/lib/format';
import { categoryIcon } from '@/lib/category-icons';

/** Dark "Top categories" panel. Uses the category photo from Admin → Categories when uploaded. */
export default function CategoryTiles({ title, subtitle, categories = [] }) {
  if (!categories.length) return null;
  return (
    <section className="wrap mt-14 sm:mt-16">
      <div className="contours relative overflow-hidden rounded-3xl p-5 shadow-lift sm:p-8 lg:p-10">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-signal/20 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <SectionHead kicker="Explore our" title={title || 'Top Categories'} subtitle={subtitle} link="/shop" linkLabel="View all categories" dark />
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.slice(0, 6).map((c, k) => {
              const { Icon, ink } = categoryIcon(c.slug);
              return (
                <li key={c.id} className="reveal" style={{ '--i': k % 3 }}>
                  <Link href={`/category/${c.slug}`} className="group relative flex aspect-[16/10] flex-col justify-end overflow-hidden rounded-2xl border border-white/10 bg-night-700">
                    {c.image?.url ? (
                      <Image src={c.image.url} alt="" fill sizes="(min-width:1024px) 30vw, (min-width:640px) 45vw, 90vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-br from-night-600 via-night-700 to-night" aria-hidden="true" />
                        <Icon size={150} strokeWidth={0.9} className="absolute -right-4 -top-3 opacity-25 transition-transform duration-500 group-hover:scale-105" style={{ color: ink === '#C24A12' ? '#EE5A1F' : '#d9d5cc' }} aria-hidden="true" />
                      </>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" aria-hidden="true" />
                    <div className="relative flex items-end justify-between gap-3 p-4 sm:p-5">
                      <div>
                        <p className="font-display text-lg font-semibold text-white">{c.name}</p>
                        <p className="text-[13px] text-stone-300">{plural(c.productCount, 'product')}</p>
                      </div>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-signal text-white transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                        <ArrowRight size={17} />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
