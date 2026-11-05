'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play, Receipt, Truck, RotateCcw, ShieldCheck, BadgeCheck } from 'lucide-react';
import Mountains from '../ui/Mountains';

const ICONS = { receipt: Receipt, truck: Truck, rotate: RotateCcw, shield: ShieldCheck };
const isExternal = (href) => /^https?:\/\//i.test(href || '');

/** Last word of the headline is set in the brush-script accent, with a hand-drawn underline. */
function Headline({ text, as: Tag = 'h2', animate = false }) {
  const words = String(text || '').trim().split(/\s+/);
  const last = words.length > 1 ? words.pop() : null;
  const w = (k) => (animate ? { className: 'word-up', style: { '--w': k } } : {});
  return (
    <Tag className="font-display text-display-xl font-extrabold text-white" aria-label={animate ? text : undefined}>
      {/* each word climbs in; the accessible name stays the whole sentence */}
      {words.map((word, k) => (
        <span key={k} aria-hidden={animate || undefined}>
          <span {...w(k)}>{word}</span>{' '}
        </span>
      ))}
      {last ? (
        <span aria-hidden={animate || undefined} className={`relative inline-block whitespace-nowrap font-script font-normal text-signal ${animate ? 'word-up' : ''}`} style={animate ? { '--w': words.length } : undefined}>
          {last}
          <svg className={`absolute -bottom-2 left-0 h-3 w-full text-signal ${animate ? 'brush' : ''}`} style={animate ? { '--d': `${300 + words.length * 85 + 450}ms` } : undefined} viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
            <path d="M2 9 C 40 2, 120 1, 198 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </span>
      ) : null}
    </Tag>
  );
}

/** Link that works for site paths and full URLs. */
function SmartLink({ href, newTab, className, children, ...rest }) {
  const target = newTab || isExternal(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  if (isExternal(href)) {
    return (
      <a href={href} className={className} {...target} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} {...target} {...rest}>
      {children}
    </Link>
  );
}

/**
 * Banner photo. Phones and small tablets (under 768px wide) get the mobile image, larger screens the
 * desktop image; if only one was uploaded it is used everywhere. Only the visible one is preloaded.
 */
function SlideImage({ b, priority }) {
  const desk = b.image?.desktop || b.image?.mobile;
  const mob = b.image?.mobile || b.image?.desktop;
  if (!desk) return null;
  const alt = b.image.alt || (b.layout === 'image_only' ? b.title : '');
  if (desk === mob) return <Image src={desk} alt={alt} fill priority={priority} sizes="100vw" className="object-cover" />;
  return (
    <>
      <Image src={mob} alt={alt} fill priority={priority} sizes="(max-width: 767px) 100vw, 1px" className="object-cover md:hidden" />
      <Image src={desk} alt={alt} fill priority={priority} sizes="(min-width: 768px) 100vw, 1px" className="hidden object-cover md:block" />
    </>
  );
}

const hasImage = (b) => Boolean(b.image?.desktop || b.image?.mobile);

/** A few fixed stars over the dusk sky (decorative; positions are constant so SSR matches). */
const STARS = [
  [8, 12, 1.6, 0], [17, 26, 1.1, 1.2], [26, 9, 1.4, 0.6], [34, 31, 1, 2.1], [43, 15, 1.8, 1.6], [52, 7, 1.2, 0.3],
  [61, 22, 1, 2.6], [69, 11, 1.5, 1], [78, 29, 1.1, 0.8], [86, 8, 1.3, 2.2], [93, 19, 1, 1.4], [12, 38, 0.9, 3], [57, 34, 0.9, 1.9],
];
function Sky() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {STARS.map(([x, y, rad, d], k) => (
        <span key={k} className="star absolute rounded-full bg-white" style={{ left: `${x}%`, top: `${y}%`, width: rad * 2, height: rad * 2, '--d': `${d}s`, '--t': `${2.6 + (k % 4) * 0.7}s` }} />
      ))}
    </div>
  );
}

function OverlaySlide({ b, first, trust, active }) {
  const img = hasImage(b);
  // remounting the text block on activation replays its entrance
  const anim = active;
  return (
    <>
      {img ? (
        <>
          <div key={active ? 'kb-on' : 'kb-off'} className={`absolute inset-0 ${active ? 'ken-burns' : ''}`}>
            <SlideImage b={b} priority={first} />
          </div>
          <div className={`absolute inset-0 ${b.theme === 'light' ? 'bg-gradient-to-r from-white/90 via-white/60 to-transparent' : 'bg-gradient-to-r from-night via-night/75 to-night/10'}`} />
        </>
      ) : (
        <>
          <div className="dusk absolute inset-0" aria-hidden="true" />
          <Sky />
          <div className="sun-drift absolute right-[12%] top-[14%] h-40 w-40 rounded-full bg-[#ffb35c] opacity-25 blur-3xl" aria-hidden="true" />
          <Mountains animated className="absolute inset-x-0 bottom-0 h-[62%] w-full" />
        </>
      )}

      {/* the whole banner opens linkHref; buttons sit above this layer */}
      {b.linkHref ? (
        <SmartLink href={b.linkHref} newTab={b.openInNewTab} className="absolute inset-0 z-10" aria-label={b.title} tabIndex={-1}>
          <span className="sr-only">{b.title}</span>
        </SmartLink>
      ) : null}

      <div className="wrap pointer-events-none relative z-20 flex h-full flex-col justify-center py-16 lg:py-20">
        <div key={anim ? 'on' : 'off'} className={`max-w-2xl ${b.theme === 'light' && img ? '[&_h1]:text-ink [&_h2]:text-ink [&_p]:text-graphite' : ''}`}>
          {b.eyebrow ? (
            <p className={`kicker kicker-trail mb-4 ${anim ? 'fade-up' : ''}`} style={{ '--d': '40ms' }}>
              {b.eyebrow}
            </p>
          ) : null}
          <Headline text={b.title} as={first ? 'h1' : 'h2'} animate={anim} />
          {b.subtitle ? (
            <p className={`mt-6 max-w-lg text-[17px] leading-relaxed text-stone-200 ${anim ? 'fade-up' : ''}`} style={{ '--d': '520ms' }}>
              {b.subtitle}
            </p>
          ) : null}

          {first && trust.length ? (
            <ul className={`mt-7 hidden flex-wrap gap-x-6 gap-y-4 sm:flex ${anim ? 'fade-up' : ''}`} style={{ '--d': '680ms' }}>
              {trust.slice(0, 3).map((t) => {
                const Icon = ICONS[t.icon] || BadgeCheck;
                return (
                  <li key={t.title} className="flex max-w-[15rem] items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/5">
                      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span className="text-[13px] font-semibold leading-tight text-white">{t.title}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <div className={`pointer-events-auto mt-8 flex flex-wrap gap-3 sm:mt-9 [&>*]:flex-1 sm:[&>*]:flex-none ${anim ? 'fade-up' : ''}`} style={{ '--d': '800ms' }}>
            {b.ctaLabel && (b.ctaHref || b.linkHref) ? (
              <SmartLink href={b.ctaHref || b.linkHref} newTab={!b.ctaHref && b.openInNewTab} className="btn-primary px-5 sm:px-7">
                {b.ctaLabel} <ArrowRight size={17} aria-hidden="true" />
              </SmartLink>
            ) : null}
            {b.secondaryCtaLabel && b.secondaryCtaHref ? (
              <SmartLink href={b.secondaryCtaHref} className="btn-outline-light px-5 sm:px-7">
                {b.secondaryCtaLabel}
              </SmartLink>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function ImageOnlySlide({ b, first }) {
  const pic = (
    <>
      <SlideImage b={b} priority={first} />
      {first ? <h1 className="sr-only">{b.title}</h1> : null}
    </>
  );
  return b.linkHref ? (
    <SmartLink href={b.linkHref} newTab={b.openInNewTab} className="absolute inset-0 block focus-visible:outline-offset-[-4px]" aria-label={b.title}>
      {pic}
    </SmartLink>
  ) : (
    pic
  );
}

/**
 * Homepage hero slider. Banners come from Admin → Content → Banners (placement "Homepage hero"):
 * each can link the whole banner to a page, set its own display time, and be a photo with text
 * on top or a finished banner image. Auto-advances, pauses on hover/focus/hidden tab and for
 * visitors who prefer reduced motion; swipe, arrows and dots work everywhere.
 */
export default function Hero({ banners = [], trust = [] }) {
  const n = banners.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false); // visitor pressed pause
  const [hold, setHold] = useState(false); // hover / focus / hidden tab
  const [reduced, setReduced] = useState(false);
  const touch = useRef(null);
  const sectionRef = useRef(null);
  const raf = useRef(0);

  // pointer parallax for the ridge lines (mouse only; skipped for reduced motion)
  const onPointerMove = (e) => {
    if (reduced || e.pointerType !== 'mouse') return;
    const el = sectionRef.current;
    if (!el || raf.current) return;
    const { clientX, clientY } = e;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', (((clientX - rect.left) / rect.width) * 2 - 1).toFixed(3));
      el.style.setProperty('--my', (((clientY - rect.top) / rect.height) * 2 - 1).toFixed(3));
    });
  };

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    const vis = () => setHold(document.hidden);
    document.addEventListener('visibilitychange', vis);
    return () => {
      mq.removeEventListener('change', on);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  const go = useCallback((to) => setI(((to % n) + n) % n), [n]);
  const playing = n > 1 && !paused && !hold && !reduced;
  const duration = (banners[i]?.durationSeconds || 6) * 1000;

  useEffect(() => {
    if (!playing) return undefined;
    const t = setTimeout(() => go(i + 1), duration);
    return () => clearTimeout(t);
  }, [playing, i, duration, go]);

  if (!n) return null;

  const onTouchStart = (e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e) => {
    const s = touch.current;
    touch.current = null;
    if (!s || n < 2) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) go(i + (dx < 0 ? 1 : -1));
  };

  return (
    <section
      className="group/hero relative overflow-hidden bg-night text-white"
      aria-roledescription={n > 1 ? 'carousel' : undefined}
      aria-label="Featured"
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => {
        setHold(false);
        sectionRef.current?.style.setProperty('--mx', '0');
        sectionRef.current?.style.setProperty('--my', '0');
      }}
      onPointerMove={onPointerMove}
      ref={sectionRef}
      onFocusCapture={() => setHold(true)}
      onBlurCapture={(e) => !e.currentTarget.contains(e.relatedTarget) && setHold(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onKeyDown={(e) => {
        if (n < 2) return;
        if (e.key === 'ArrowRight') go(i + 1);
        if (e.key === 'ArrowLeft') go(i - 1);
      }}
    >
      <div className="relative h-[540px] sm:h-[600px] lg:h-[clamp(430px,33vw,720px)]">
        {banners.map((b, k) => {
          const active = k === i;
          return (
            <div
              key={b.id || k}
              className={`absolute inset-0 transition-opacity duration-700 ease-out motion-reduce:transition-none ${active ? 'z-[1] opacity-100' : 'pointer-events-none z-0 opacity-0'}`}
              role={n > 1 ? 'group' : undefined}
              aria-roledescription={n > 1 ? 'slide' : undefined}
              aria-label={n > 1 ? `${k + 1} of ${n}` : undefined}
              aria-hidden={!active}
              inert={!active}
            >
              {b.layout === 'image_only' && hasImage(b) ? <ImageOnlySlide b={b} first={k === 0} /> : <OverlaySlide b={b} first={k === 0} trust={trust} active={active} />}
            </div>
          );
        })}
      </div>

      {n > 1 ? (
        <>
          <button type="button" onClick={() => go(i - 1)} className="absolute left-3 top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-white hover:text-ink sm:flex lg:left-5" aria-label="Previous banner">
            <ChevronLeft size={22} />
          </button>
          <button type="button" onClick={() => go(i + 1)} className="absolute right-3 top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-white hover:text-ink sm:flex lg:right-5" aria-label="Next banner">
            <ChevronRight size={22} />
          </button>

          <div className="absolute inset-x-0 bottom-5 z-30 flex items-center justify-center gap-3">
            <ul className="flex items-center gap-2 rounded-full bg-black/35 px-3 py-2 backdrop-blur">
              {banners.map((b, k) => (
                <li key={b.id || k}>
                  <button type="button" onClick={() => go(k)} aria-label={`Show banner ${k + 1}: ${b.title}`} aria-current={k === i ? 'true' : undefined} className={`relative block h-2 overflow-hidden rounded-full transition-all ${k === i ? 'w-8 bg-white/35' : 'w-2 bg-white/60 hover:bg-white'}`}>
                    {k === i ? <span key={`${i}-${playing}`} className={`absolute inset-y-0 left-0 rounded-full bg-signal ${playing ? 'hero-progress' : 'w-full'}`} style={playing ? { animationDuration: `${duration}ms` } : undefined} /> : null}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setPaused((p) => !p)} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-white hover:text-ink" aria-label={paused ? 'Play banner slideshow' : 'Pause banner slideshow'}>
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
