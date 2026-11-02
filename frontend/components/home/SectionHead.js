import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/** Kicker + title + subtitle, with an optional "View all" link and extra controls on the right. */
export default function SectionHead({ kicker, title, subtitle, link, linkLabel = 'View all', as: As = 'h2', dark = false, children }) {
  return (
    <div className="reveal mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker ? <p className="kicker kicker-trail mb-1.5">{kicker}</p> : null}
        <As className={`font-display text-display-md ${dark ? 'text-white' : ''}`}>{title}</As>
        {subtitle ? <p className={`mt-1.5 text-[15px] ${dark ? 'text-stone-300' : 'text-graphite-400'}`}>{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-4">
        {link ? (
          <Link href={link} className={`inline-flex shrink-0 items-center gap-1.5 font-display text-[14px] font-semibold ${dark ? 'text-stone-200 hover:text-white' : 'text-ink hover:text-signal'}`}>
            {linkLabel} <ArrowRight size={16} className="text-signal" aria-hidden="true" />
          </Link>
        ) : null}
        {children}
      </div>
    </div>
  );
}
