import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import Mountains from '../ui/Mountains';

export default function PromoBanners({ banners = [] }) {
  if (!banners.length) return null;
  return (
    <section className="wrap mt-16 grid gap-5 sm:mt-20 md:grid-cols-2">
      {banners.slice(0, 2).map((b) => {
        const light = b.theme === 'light';
        return (
          <Link key={b.id} href={b.ctaHref || '/shop'} className={`group relative flex min-h-[250px] flex-col justify-end overflow-hidden rounded-3xl p-7 shadow-card sm:p-9 ${light ? 'bg-stone-100 text-ink' : 'bg-night text-white'}`}>
            {b.image?.desktop ? (
              <>
                <Image src={b.image.desktop} alt={b.image.alt || ''} fill sizes="(min-width:768px) 50vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className={`absolute inset-0 ${light ? 'bg-gradient-to-t from-white/90 to-transparent' : 'bg-gradient-to-t from-night/90 to-transparent'}`} />
              </>
            ) : light ? null : (
              <>
                <div className="dusk absolute inset-0" aria-hidden="true" />
                <Mountains className="absolute inset-x-0 bottom-0 h-1/2 w-full" />
              </>
            )}
            <div className="relative">
              {b.eyebrow ? <p className="kicker">{b.eyebrow}</p> : null}
              <p className="mt-1 font-display text-2xl font-bold sm:text-3xl">{b.title}</p>
              {b.subtitle ? <p className={`mt-2 max-w-md ${light ? 'text-graphite' : 'text-stone-200'}`}>{b.subtitle}</p> : null}
              {b.ctaLabel ? (
                <span className="mt-5 inline-flex items-center gap-2 font-display text-[14px] font-semibold text-signal">
                  {b.ctaLabel} <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </span>
              ) : null}
            </div>
          </Link>
        );
      })}
    </section>
  );
}
