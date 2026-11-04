import Link from 'next/link';
import { ArrowRight, BadgeCheck, Receipt, MessageSquareQuote, Truck, Mountain, Tent, Bike, ShieldHalf, School, Users, PackageCheck, Search, MapPin, Phone, Mail, Clock, Check } from 'lucide-react';
import { apiGet, getShell, siteUrl } from '@/lib/api-server';
import Breadcrumbs from '@/components/listing/Breadcrumbs';
import ProductCard from '@/components/product/ProductCard';
import TrailMap from '@/components/about/TrailMap';
import Mountains from '@/components/ui/Mountains';
import CountUp from '@/components/motion/CountUp';
import { categoryIcon } from '@/lib/category-icons';

export const revalidate = 300;

export const metadata = {
  title: 'About us',
  description: 'DareDevil Gears is a Greater Noida brand making tactical and adventure gear for trekkers, campers, riders and teams who work outdoors. Honest specs, GST-inclusive prices, delivery across India.',
  alternates: { canonical: '/about' },
};

/* ------------------------------------------------------------------ content */
// Everything below is factual: what the store sells, how it sells it and where it is based.

const PRINCIPLES = [
  {
    Icon: BadgeCheck,
    title: 'Specs you can trust',
    text: 'Every product page says what the item is made of, what it is built for — and what it is not. Training and tactical gear is never sold as protective equipment unless a test certificate is shown on the page.',
  },
  {
    Icon: Receipt,
    title: 'The price is the price',
    text: 'All prices include GST. Packaging and delivery are shown on the product page, in the cart and at checkout before you pay — nothing is added afterwards.',
  },
  {
    Icon: MessageSquareQuote,
    title: 'Only real reviews',
    text: 'Reviews come from customers who received the product. We do not write them, buy them or hide the honest ones.',
  },
  {
    Icon: Truck,
    title: 'Delivered across India',
    text: 'Orders ship through trusted courier partners with live tracking. Pay online by UPI, card or net banking — or choose cash on delivery where it is available.',
  },
];

const PEOPLE = [
  { Icon: Mountain, title: 'Trekkers', text: 'Packs, footwear and eyewear for long days on the trail.' },
  { Icon: Tent, title: 'Campers', text: 'Shelter, light and camp kit that packs down small.' },
  { Icon: Bike, title: 'Riders', text: 'Bags, gloves and gear that stay put at speed.' },
  { Icon: ShieldHalf, title: 'Security & training teams', text: 'Field kit for drills, duty and daily wear.' },
  { Icon: School, title: 'Schools & expeditions', text: 'Group orders with a written quote in one working day.' },
  { Icon: Users, title: 'Everyday adventurers', text: 'Tough everyday carry for the commute and the weekend.' },
];

const STEPS = [
  { Icon: Search, title: 'You choose', text: 'Pick your gear. The price you see already includes GST, and delivery is worked out for your PIN code before you pay.' },
  { Icon: PackageCheck, title: 'We pack it', text: 'Your order is checked and packed at our base in Greater Noida, Uttar Pradesh.' },
  { Icon: Truck, title: 'It ships', text: 'A courier partner collects it and you get a tracking link by email.' },
  { Icon: Mountain, title: 'You head out', text: 'Something not right? Tell us — returns and refunds follow our published policy.' },
];

// The pack list on the story card links each line to a real department.
const PACK_LIST = [
  { label: 'A pack that carries the load', slug: 'bags-backpacks' },
  { label: 'Shelter and camp kit', slug: 'camping-outdoor' },
  { label: 'A torch you can rely on', slug: 'torches-lighting' },
  { label: 'Eyes protected from sun and dust', slug: 'tactical-eyewear' },
  { label: 'Boots for rough ground', slug: 'footwear' },
  { label: 'A multitool for everything else', slug: 'tools-survival' },
];

/* ------------------------------------------------------------------ page */

export default async function AboutPage() {
  const [shell, popular] = await Promise.all([getShell().catch(() => ({ categories: [], settings: {} })), apiGet('/products?sort=popular&limit=4', { revalidate: 300 }).catch(() => null)]);
  const biz = shell.settings?.business || {};
  const cats = (shell.categories || []).filter((c) => c.showInNav && c.productCount > 0);
  const productCount = cats.reduce((n, c) => n + (c.productCount || 0), 0);
  const products = (popular?.data || popular || []).slice(0, 4);
  const catBySlug = new Map(cats.map((c) => [c.slug, c]));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    url: `${siteUrl()}/about`,
    mainEntity: {
      '@type': 'Organization',
      name: biz.displayName || 'DareDevil Gears',
      url: siteUrl(),
      ...(biz.email ? { email: biz.email } : {}),
      ...(biz.phone ? { telephone: biz.phone } : {}),
      address: { '@type': 'PostalAddress', addressLocality: 'Greater Noida', addressRegion: 'Uttar Pradesh', addressCountry: 'IN' },
    },
  };

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden bg-night text-white">
        <div className="dusk absolute inset-0 opacity-70" aria-hidden="true" />
        <Mountains className="absolute inset-x-0 bottom-0 h-1/3 w-full opacity-70" />
        <div className="wrap relative grid grid-cols-1 items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div>
            <div className="[&_a:hover]:text-white [&_a]:text-stone-300 [&_li]:text-stone-400 [&_span[aria-current]]:text-white">
              <Breadcrumbs items={[{ name: 'About us', href: '/about' }]} />
            </div>
            <p className="kicker kicker-trail fade-up mt-6" style={{ '--d': '60ms' }}>
              About DareDevil Gears
            </p>
            <h1 className="fade-up mt-3 font-display text-display-xl font-extrabold leading-[1.05] text-white" style={{ '--d': '140ms' }}>
              Gear for the ones who go <span className="font-script font-normal text-signal">further.</span>
            </h1>
            <p className="fade-up mt-6 max-w-xl text-[17px] leading-relaxed text-stone-200" style={{ '--d': '260ms' }}>
              We are a Made-in-India brand from Greater Noida making tactical and adventure gear — bags, camp kit, lighting, eyewear, footwear and field tools — for people who spend their days outdoors and need kit that keeps up.
            </p>
            <div className="fade-up mt-8 flex flex-wrap gap-3" style={{ '--d': '380ms' }}>
              <Link href="/shop" className="btn-primary px-7">
                Shop the range <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link href="/bulk-orders" className="btn-outline-light px-7">
                Bulk orders
              </Link>
            </div>
            <dl className="fade-up mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-white/10 pt-6" style={{ '--d': '480ms' }}>
              {[
                [productCount, 'products'],
                [cats.length, 'categories'],
                ['100%', 'GST-inclusive prices'],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd>
                    <CountUp value={v} className="block font-display text-3xl font-bold tabular" />
                    <span className="mt-1 block text-[12.5px] text-stone-300">{l}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <TrailMap className="mx-auto w-full max-w-[580px] drop-shadow-[0_30px_60px_rgba(0,0,0,0.45)]" />
        </div>
      </section>

      {/* ---------------------------------------------------------------- story */}
      <section className="wrap mt-16 grid grid-cols-1 gap-10 sm:mt-20 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
        <div className="reveal">
          <p className="kicker kicker-trail">Our story</p>
          <h2 className="mt-2 font-display text-display-lg">Built for the trail, the field and the daily grind.</h2>
          <div className="mt-6 space-y-5 text-[16.5px] leading-[1.75] text-graphite">
            <p>
              DareDevil Gears started with a simple idea: people who trek, camp, ride and work outdoors in India deserve gear that is designed for Indian conditions — heat, monsoon, dust and long distances — and sold honestly.
            </p>
            <p>
              So we build a focused range instead of a catalogue of everything. Load-carrying bags and backpacks. Camping equipment. Torches and lighting. Tactical eyewear. Field footwear and apparel. Tools for survival and repair. Training gear, personal safety products, a range for women in <em>Memsahab Corner</em>, and care products for vehicles and generators.
            </p>
            <p>
              Every product page tells you what you are buying in plain words — materials, sizes and limits — so you can choose with confidence. And when you check out, the total you see is the total you pay.
            </p>
          </div>
        </div>

        {/* pack-list card: a field note that links to the real departments */}
        <aside className="reveal relative" style={{ '--i': 1 }} aria-labelledby="packlist">
          <div className="absolute -inset-3 -rotate-2 rounded-3xl bg-signal/15" aria-hidden="true" />
          <div className="contours-light relative rounded-3xl border border-stone-300/80 p-6 shadow-lift sm:p-8">
            <p className="font-script text-2xl text-signal">Field notes</p>
            <h3 id="packlist" className="mt-1 font-display text-xl font-semibold text-ink">
              Your weekend trek, packed
            </h3>
            <ul className="mt-5 space-y-3">
              {PACK_LIST.map((item) => {
                const cat = catBySlug.get(item.slug);
                const { Icon, tint, ink } = categoryIcon(item.slug);
                const row = (
                  <>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-signal bg-white text-signal">
                      <Check size={15} strokeWidth={3} aria-hidden="true" />
                    </span>
                    <span className="flex-1 text-[15px] text-ink">{item.label}</span>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: tint, color: ink }}>
                      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                    </span>
                  </>
                );
                return (
                  <li key={item.slug}>
                    {cat ? (
                      <Link href={`/category/${cat.slug}`} className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white">
                        {row}
                      </Link>
                    ) : (
                      <span className="flex items-center gap-3 px-2 py-1.5">{row}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-5 border-t border-dashed border-stone-400 pt-4 text-[13px] text-graphite-400">Tap a line to see that part of the range.</p>
          </div>
        </aside>
      </section>

      {/* ---------------------------------------------------------------- principles */}
      <section className="mt-20 bg-white py-16 sm:mt-24 sm:py-20">
        <div className="wrap">
          <div className="reveal max-w-2xl">
            <p className="kicker kicker-trail">How we work</p>
            <h2 className="mt-2 font-display text-display-lg">Four promises we keep on every order.</h2>
          </div>
          <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PRINCIPLES.map(({ Icon, title, text }, k) => (
              <li key={title} className="reveal group rounded-2xl border border-stone-300/70 bg-paper p-6 transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-lift" style={{ '--i': k }}>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-signal text-white shadow-glow transition-transform duration-300 group-hover:rotate-[-8deg]">
                  <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <h3 className="mt-5 font-display text-[17px] font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-graphite">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------------- range */}
      {cats.length ? (
        <section className="wrap mt-16 sm:mt-20">
          <div className="reveal flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="kicker kicker-trail">What we make</p>
              <h2 className="mt-2 font-display text-display-lg">The full range, in {cats.length} departments.</h2>
            </div>
            <Link href="/shop" className="inline-flex items-center gap-1.5 font-display text-[14px] font-semibold text-ink hover:text-signal">
              Shop all {productCount} products <ArrowRight size={16} className="text-signal" aria-hidden="true" />
            </Link>
          </div>
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {cats.map((c, k) => {
              const { Icon, tint, ink } = categoryIcon(c.slug);
              return (
                <li key={c.id} className="reveal-pop" style={{ '--i': k % 8 }}>
                  <Link href={`/category/${c.slug}`} className="group flex h-full items-center gap-3 rounded-2xl border border-stone-300/70 bg-white p-3.5 shadow-card transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-lift">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: tint, color: ink }}>
                      <Icon size={22} strokeWidth={1.7} aria-hidden="true" className="hop-on-hover" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14.5px] font-semibold leading-snug text-ink group-hover:text-signal-dark">{c.name}</span>
                      <span className="text-[12.5px] text-graphite-400">
                        {c.productCount} product{c.productCount > 1 ? 's' : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- people */}
      <section className="relative mt-20 overflow-hidden bg-night py-16 text-white sm:mt-24 sm:py-20">
        <div className="contours absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="wrap relative">
          <div className="reveal max-w-2xl">
            <p className="kicker kicker-trail">Who we gear up</p>
            <h2 className="mt-2 font-display text-display-lg text-white">Made for people who don&apos;t stay indoors.</h2>
          </div>
          <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PEOPLE.map(({ Icon, title, text }, k) => (
              <li key={title} className="reveal flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm" style={{ '--i': k % 3 }}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-signal/15 text-signal">
                  <Icon size={21} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-display text-[16px] font-semibold">{title}</span>
                  <span className="mt-1 block text-[14px] leading-relaxed text-stone-300">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------------- products */}
      {products.length ? (
        <section className="wrap mt-16 sm:mt-20">
          <div className="reveal flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="kicker kicker-trail">From the range</p>
              <h2 className="mt-2 font-display text-display-lg">What customers are buying.</h2>
            </div>
            <Link href="/shop?sort=popular" className="inline-flex items-center gap-1.5 font-display text-[14px] font-semibold text-ink hover:text-signal">
              See best sellers <ArrowRight size={16} className="text-signal" aria-hidden="true" />
            </Link>
          </div>
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {products.map((p, k) => (
              <li key={p.id} className="reveal" style={{ '--i': k }}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- journey (a real sequence, so numbered) */}
      <section className="wrap mt-20 sm:mt-24">
        <div className="reveal max-w-2xl">
          <p className="kicker kicker-trail">From our base to yours</p>
          <h2 className="mt-2 font-display text-display-lg">How your order reaches you.</h2>
        </div>
        <ol className="relative mt-10 grid grid-cols-1 gap-6 md:grid-cols-4 md:gap-5">
          <span className="absolute left-6 top-6 hidden h-0.5 w-[calc(100%-3rem)] border-t-2 border-dashed border-signal/40 md:block" aria-hidden="true" />
          {STEPS.map(({ Icon, title, text }, k) => (
            <li key={title} className="reveal relative" style={{ '--i': k }}>
              <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 border-signal bg-paper text-signal">
                <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <p className="mt-4 font-display text-[13px] font-semibold text-signal-dark">Step {k + 1}</p>
              <h3 className="mt-0.5 font-display text-[17px] font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-graphite">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------------- contact + cta */}
      <section className="wrap mt-20 sm:mt-24">
        <div className="reveal relative overflow-hidden rounded-3xl bg-night text-white">
          <div className="dusk absolute inset-0 opacity-80" aria-hidden="true" />
          <Mountains className="absolute inset-x-0 bottom-0 h-1/2 w-full opacity-80" />
          <div className="relative grid grid-cols-1 gap-10 p-7 sm:p-10 lg:grid-cols-[1.2fr_1fr] lg:p-14">
            <div>
              <h2 className="font-display text-display-lg text-white">Planning your next trip — or kitting out a team?</h2>
              <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-stone-200">Browse the range, or talk to us about sizes, specs and group orders. We reply within one working day.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/shop" className="btn-primary px-7">
                  Shop now <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <Link href="/contact" className="btn-outline-light px-7">
                  Contact us
                </Link>
              </div>
            </div>
            <ul className="space-y-3 self-center rounded-2xl border border-white/10 bg-night/60 p-6 text-[14.5px] backdrop-blur-sm">
              <li className="flex gap-3">
                <MapPin size={18} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                <span>{biz.registeredAddress || biz.addressShort || 'Greater Noida, Uttar Pradesh'}</span>
              </li>
              {biz.phone ? (
                <li className="flex gap-3">
                  <Phone size={18} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                  <a href={`tel:${biz.phone.replace(/\s/g, '')}`} className="hover:text-signal">
                    {biz.phone}
                  </a>
                </li>
              ) : null}
              {biz.email ? (
                <li className="flex gap-3">
                  <Mail size={18} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                  <a href={`mailto:${biz.email}`} className="break-all hover:text-signal">
                    {biz.email}
                  </a>
                </li>
              ) : null}
              {biz.hours ? (
                <li className="flex gap-3">
                  <Clock size={18} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
                  <span>{biz.hours}</span>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
