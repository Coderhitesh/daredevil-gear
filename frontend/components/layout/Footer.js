import Link from 'next/link';
import { Mail, Phone, MapPin, Clock, Instagram, Facebook, Youtube, Linkedin, Twitter, MessageCircle, Gift, Sparkles, BellOff } from 'lucide-react';
import Newsletter from '../home/Newsletter';
import Logo from './Logo';
import Mountains from '../ui/Mountains';
import TopoLines from '../ui/TopoLines';

const DEFAULT_HELP = [
  { label: 'Track your order', href: '/track-order' },
  { label: 'Shipping policy', href: '/pages/shipping-policy' },
  { label: 'Returns & refunds', href: '/pages/return-refund-policy' },
  { label: 'FAQ', href: '/pages/faq' },
];

function Column({ title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <h2 className="mb-4 font-display text-[15px] font-semibold text-white">{title}</h2>
      <ul className="space-y-2.5 text-[14px]">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="text-stone-400 transition-colors hover:text-signal">
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewsletterBand() {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.07]">
      <div className="dusk absolute inset-0 opacity-60" aria-hidden="true" />
      <TopoLines className="absolute inset-0 h-full w-full text-signal/25" />
      <Mountains className="absolute inset-x-0 bottom-0 h-2/3 w-full opacity-80" />
      <div className="wrap relative grid grid-cols-1 gap-8 py-12 lg:grid-cols-[1.1fr_1fr_1fr] lg:items-center">
        <div className="flex gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-signal/50 text-signal">
            <Mail size={24} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold text-white sm:text-2xl">Join our newsletter</h2>
            <p className="mt-1 text-[14px] text-stone-300">New arrivals and genuine offers. No spam.</p>
          </div>
        </div>
        <Newsletter variant="band" source="footer" />
        <ul className="grid grid-cols-3 gap-3 text-[12.5px] text-stone-300">
          {[
            [Gift, 'Genuine offers only'],
            [Sparkles, 'New arrivals first'],
            [BellOff, 'Unsubscribe any time'],
          ].map(([Icon, label]) => (
            <li key={label} className="flex flex-col items-center gap-2 text-center lg:items-start lg:text-left">
              <Icon size={20} strokeWidth={1.6} className="text-signal" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Mandatory seller & grievance details (Consumer Protection (E-Commerce) Rules 2020) are always shown. */
export default function Footer({ shell }) {
  const s = shell?.settings || {};
  const biz = s.business || {};
  const social = s.social || {};
  const nav = shell?.navigation || {};
  const year = new Date().getFullYear();
  const quick = [
    { label: 'Home', href: '/' },
    { label: 'Shop all', href: '/shop' },
    ...(shell?.categories || []).filter((c) => c.showInNav && c.productCount > 0).slice(0, 5).map((c) => ({ label: c.name, href: `/category/${c.slug}` })),
  ];
  const socials = [
    [social.instagram, Instagram, 'Instagram'],
    [social.facebook, Facebook, 'Facebook'],
    [social.youtube, Youtube, 'YouTube'],
    [social.linkedin, Linkedin, 'LinkedIn'],
    [social.twitter, Twitter, 'Twitter'],
    [social.whatsappChannel || (biz.whatsapp ? `https://wa.me/${biz.whatsapp.replace(/\D/g, '')}` : ''), MessageCircle, 'WhatsApp'],
  ].filter(([u]) => u);

  return (
    <footer className="mt-24 bg-night text-stone-300">
      <NewsletterBand />

      <div className="wrap grid grid-cols-1 gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.3fr]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-[14px] leading-relaxed text-stone-400">{biz.tagline || 'Made-in-India tactical & adventure gear for trekkers, campers, riders and everyday adventurers.'}</p>
          {socials.length ? (
            <ul className="mt-5 flex gap-2">
              {socials.map(([url, Icon, label]) => (
                <li key={label}>
                  <a href={url} target="_blank" rel="noreferrer" aria-label={label} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-stone-300 transition-colors hover:border-signal hover:bg-signal hover:text-white">
                    <Icon size={16} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Column title="Quick links" items={quick} />
        <Column title="Customer care" items={nav.footer_help?.length ? nav.footer_help : DEFAULT_HELP} />
        <Column title="Company" items={nav.footer_company} />
        <div>
          <h2 className="mb-4 font-display text-[15px] font-semibold text-white">Contact us</h2>
          <ul className="space-y-3 text-[14px]">
            {biz.phone ? (
              <li className="flex gap-3">
                <Phone size={16} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                <a href={`tel:${biz.phone.replace(/\s/g, '')}`} className="hover:text-white">{biz.phone}</a>
              </li>
            ) : null}
            {biz.email ? (
              <li className="flex gap-3">
                <Mail size={16} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                <a href={`mailto:${biz.email}`} className="break-all hover:text-white">{biz.email}</a>
              </li>
            ) : null}
            {biz.registeredAddress || biz.addressShort ? (
              <li className="flex gap-3">
                <MapPin size={16} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                <span>{biz.registeredAddress || biz.addressShort}</span>
              </li>
            ) : null}
            {biz.hours ? (
              <li className="flex gap-3">
                <Clock size={16} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                <span>{biz.hours}</span>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/[0.07]">
        <div className="wrap grid grid-cols-1 gap-4 py-6 text-[13px] text-stone-400 md:grid-cols-2">
          <p>
            <span className="text-stone-200">{biz.legalName || biz.displayName || 'DareDevil Gears'}</span>
            {biz.gstin ? <> · GSTIN {biz.gstin}</> : null}
            {biz.cin ? <> · CIN {biz.cin}</> : null}
          </p>
          {/* <p className="md:text-right">
            <Link href="/pages/grievance-redressal" className="text-stone-200 hover:text-signal">
              Grievance Officer
            </Link>
            {s.grievanceOfficer?.name ? `: ${s.grievanceOfficer.name}${s.grievanceOfficer.designation ? `, ${s.grievanceOfficer.designation}` : ''}` : ''} — complaints acknowledged within 48 hours, resolved within 30 days.
          </p> */}
        </div>
      </div>

      <div className="border-t border-white/[0.07]">
        <div className="wrap flex flex-col gap-4 py-5 text-[12.5px] text-stone-400 md:flex-row md:items-center md:justify-between">
          <p>© {year} DareDevil Gears. All prices include GST.</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {(nav.footer_legal?.length ? nav.footer_legal : [{ label: 'Terms & conditions', href: '/pages/terms-and-conditions' }, { label: 'Privacy policy', href: '/pages/privacy-policy' }]).map((i) => (
              <li key={i.href}>
                <Link href={i.href} className="hover:text-white">
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap items-center gap-2" aria-label="Payment methods">
            {['UPI', 'Cards', 'Net banking', 'Wallets'].map((m) => (
              <li key={m} className="rounded-md border border-white/15 px-2 py-1 font-display text-[11px] font-semibold text-stone-200">
                {m}
              </li>
            ))}
            <li className="text-[11px] text-stone-400">via Razorpay</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
