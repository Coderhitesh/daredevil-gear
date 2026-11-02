import Link from 'next/link';
import { ArrowRight, Building2, Users, FileText } from 'lucide-react';

export default function BulkBand({ title, config = {} }) {
  return (
    <section className="wrap mt-20 sm:mt-24">
      <div className="contours relative grid gap-8 overflow-hidden rounded-3xl p-7 text-white shadow-lift sm:p-10 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-signal/25 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <p className="kicker">Teams & institutions</p>
          <h2 className="mt-1.5 font-display text-display-md text-white">{title}</h2>
          {config.body ? <p className="mt-3 max-w-xl text-stone-300">{config.body}</p> : null}
          {config.ctaLabel ? (
            <Link href={config.ctaHref || '/bulk-orders'} className="btn-primary mt-7 px-7">
              {config.ctaLabel} <ArrowRight size={17} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
        <ul className="relative grid gap-3 text-[14px]">
          {[
            [Users, 'Units, schools, clubs and expedition teams'],
            [Building2, 'Government and corporate buyers'],
            [FileText, 'GST invoice with your GSTIN'],
          ].map(([Icon, text]) => (
            <li key={text} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <Icon size={18} className="shrink-0 text-signal" aria-hidden="true" /> {text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
