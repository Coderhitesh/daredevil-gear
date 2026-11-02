import Image from 'next/image';
import Breadcrumbs from '../listing/Breadcrumbs';
import Mountains from '../ui/Mountains';

/**
 * Dark page header used across the shop (listing, CMS, contact, cart…).
 * crumbs: [{ name, href }] — the current page last.
 */
export default function PageHero({ title, subtitle, crumbs, kicker, image, compact = false, children }) {
  return (
    <section className="page-hero">
      {image ? (
        <>
          <Image src={image} alt="" fill priority sizes="100vw" className="object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-r from-night via-night/80 to-night/30" />
        </>
      ) : (
        <>
          <div className="dusk absolute inset-0 opacity-70" aria-hidden="true" />
          <Mountains className="absolute inset-x-0 bottom-0 h-[55%] w-full opacity-90" />
        </>
      )}
      <div className={`wrap relative ${compact ? 'py-8 sm:py-10' : 'py-10 sm:py-14'}`}>
        {crumbs ? (
          <div className="[&_a]:text-stone-300 [&_a:hover]:text-white [&_nav]:text-stone-400 [&_span[aria-current]]:text-white">
            <Breadcrumbs items={crumbs} />
          </div>
        ) : null}
        {kicker ? <p className="kicker mt-5">{kicker}</p> : null}
        <h1 className={`font-display text-display-lg text-white ${kicker ? 'mt-1.5' : crumbs ? 'mt-4' : ''}`}>{title}</h1>
        {subtitle ? <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-stone-300">{subtitle}</p> : null}
        {children}
      </div>
    </section>
  );
}
