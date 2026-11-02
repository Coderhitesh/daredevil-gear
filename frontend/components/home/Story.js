import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Package, LayoutGrid, MapPin } from 'lucide-react';
import Mountains from '../ui/Mountains';
import CountUp from '../motion/CountUp';

/**
 * Full-width brand band. The figures on the right are live counts from the catalogue,
 * never marketing estimates.
 */
export default function Story({ title, config = {}, stats = {} }) {
  const figures = [
    stats.products ? { Icon: Package, value: stats.products, label: 'Products in the range' } : null,
    stats.categories ? { Icon: LayoutGrid, value: stats.categories, label: 'Gear categories' } : null,
    { Icon: MapPin, value: 'India', label: 'Designed and shipped from' },
  ].filter(Boolean);

  return (
    <section className="relative mt-20 overflow-hidden bg-night text-white sm:mt-24">
      {config.image ? (
        <>
          <Image src={config.image} alt={config.imageAlt || ''} fill sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-night via-night/80 to-night/20" />
        </>
      ) : (
        <>
          <div className="dusk absolute inset-0" aria-hidden="true" />
          <Mountains className="absolute inset-x-0 bottom-0 h-[70%] w-full" />
        </>
      )}
      <div className="wrap relative grid gap-10 py-16 sm:py-20 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="reveal max-w-xl">
          <p className="kicker kicker-trail mb-3">Ready for your next adventure?</p>
          <h2 className="font-display text-display-lg text-white">{title}</h2>
          {config.body ? <p className="mt-5 text-[16.5px] leading-relaxed text-stone-200">{config.body}</p> : null}
          <Link href={config.ctaHref || '/shop'} className="btn-primary mt-8 px-7">
            {config.ctaLabel || 'Shop adventure gear'} <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {figures.map(({ Icon, value, label }, k) => (
            <li key={label} style={{ '--i': k + 2 }} className="reveal flex items-center gap-4 rounded-2xl border border-white/10 bg-night/60 px-5 py-4 backdrop-blur-sm">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-signal/15 text-signal">
                <Icon size={21} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span>
                <CountUp value={value} className="block font-display text-2xl font-bold leading-none tabular" />
                <span className="mt-1 block text-[13px] text-stone-300">{label}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
