import Link from 'next/link';
import { ArrowRight, BadgePercent } from 'lucide-react';
import SectionHead from './SectionHead';
import ComboCard from '../product/ComboCard';
import TopoLines from '../ui/TopoLines';

/** "Buy 3+, save 10%" deal: links to the category / products it covers. */
function MultiBuyCard({ offer, index }) {
  return (
    <li className="reveal" style={{ '--i': index }}>
      <Link href={offer.link} className="group flex h-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm transition-colors hover:border-signal/60 hover:bg-white/[0.1]">
        <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-signal text-white shadow-glow">
          <span className="font-display text-lg font-extrabold leading-none">{offer.percentOff}%</span>
          <span className="text-[10px] font-semibold leading-none">off</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15.5px] font-semibold text-white">{offer.name}</span>
          <span className="mt-0.5 block text-[13px] text-stone-300">
            Buy any {offer.minQuantity} or more{offer.scope ? ` from ${offer.scope}` : ''}
            {offer.maxDiscount ? `, up to ₹${(offer.maxDiscount / 100).toLocaleString('en-IN')} off` : ''}. Applied in your cart.
          </span>
        </span>
        <ArrowRight size={18} className="shrink-0 text-signal transition-transform group-hover:translate-x-1" aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * Homepage "Combo offers": live combos (Admin → Combo offers) with their real "bought separately"
 * price and saving, plus multi-buy deals. Set on a dark band so it reads as its own place.
 */
export default function CombosSection({ title, subtitle, combos = [], multiBuys = [] }) {
  if (!combos.length && !multiBuys.length) return null;
  return (
    <section className="relative overflow-hidden bg-night py-14 text-white sm:py-16" aria-label={title || 'Combo offers'}>
      <TopoLines className="absolute inset-0 h-full w-full text-signal/15" />
      <div className="wrap relative">
        <SectionHead kicker="Buy together, pay less" title={title || 'Combo offers'} subtitle={subtitle} dark />
        {combos.length ? (
          <ul className="grid gap-4 sm:gap-5 lg:grid-cols-2">
            {combos.map((o, k) => (
              <li key={o.id} className="reveal" style={{ '--i': k % 2 }}>
                <ComboCard offer={o} />
              </li>
            ))}
          </ul>
        ) : null}
        {multiBuys.length ? (
          <div className={combos.length ? 'mt-8' : ''}>
            <h3 className="mb-3 flex items-center gap-2 font-display text-[17px] font-semibold text-white">
              <BadgePercent size={19} className="text-signal" aria-hidden="true" /> Buy more, save more
            </h3>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {multiBuys.map((o, k) => (
                <MultiBuyCard key={o.id} offer={o} index={k % 3} />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
