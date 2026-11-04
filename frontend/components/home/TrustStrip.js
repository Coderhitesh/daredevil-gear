import { Receipt, Truck, RotateCcw, ShieldCheck, BadgeCheck } from 'lucide-react';
import Mountains from '../ui/Mountains';

const ICONS = { receipt: Receipt, truck: Truck, rotate: RotateCcw, shield: ShieldCheck };

/** "Why choose us" — the promises are edited in Admin → Homepage → Trust strip. */
export default function TrustStrip({ title, items = [] }) {
  if (!items.length) return null;
  return (
    <section className="relative overflow-hidden border-y border-stone-300/70 bg-white">
      <Mountains tone="light" className="absolute inset-x-0 bottom-0 h-14 w-full opacity-60" />
      <div className="reveal wrap relative pb-20 pt-14">
        <p className="kicker kicker-trail">Why choose us</p>
        <h2 className="mt-1.5 font-display text-display-md">{title || 'Built for every explorer'}</h2>
        <ul className="mt-9 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, k) => {
            const Icon = ICONS[it.icon] || BadgeCheck;
            return (
              <li key={it.title} className="reveal group flex gap-4" style={{ '--i': k + 1 }}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-signal text-white shadow-glow transition-transform duration-300 group-hover:rotate-[-8deg]">
                  <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div>
                  <p className="font-display text-[15px] font-semibold text-ink">{it.title}</p>
                  {it.text ? <p className="mt-1 text-[13.5px] leading-relaxed text-graphite-400">{it.text}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
