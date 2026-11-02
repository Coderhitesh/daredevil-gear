'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ZoomIn } from 'lucide-react';
import { Placeholder } from './ProductThumb';
import Lightbox from '../ui/Lightbox';

/** Image gallery with hover zoom (desktop), swipe-scroll (mobile) and a full-screen viewer. */
export default function Gallery({ images = [], videos = [], name }) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(null);
  const [lightbox, setLightbox] = useState(false);

  if (!images.length) {
    return (
      <div>
        <div className="aspect-square overflow-hidden rounded-2xl">
          <Placeholder name={name} />
        </div>
        <p className="mt-2 text-sm text-graphite-400">Product photography is being added.</p>
        <Videos videos={videos} />
      </div>
    );
  }

  const img = images[active];
  return (
    <div>
      {/* mobile: horizontal swipe */}
      <ul className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 md:hidden" aria-label="Product images">
        {images.map((im, i) => (
          <li key={im.url} className="relative aspect-square w-[88vw] shrink-0 snap-center overflow-hidden rounded-2xl bg-stone-100">
            <button type="button" className="absolute inset-0" onClick={() => (setActive(i), setLightbox(true))} aria-label={`Open image ${i + 1} of ${images.length}`}>
              <Image src={im.url} alt={im.alt || name} fill priority={i === 0} sizes="88vw" className="object-cover" />
            </button>
          </li>
        ))}
      </ul>

      {/* desktop: main image with hover zoom + thumbnails */}
      <div className="hidden gap-4 md:grid md:grid-cols-[72px_minmax(0,1fr)]">
        <ul className="space-y-2" aria-label="Choose image">
          {images.map((im, i) => (
            <li key={im.url}>
              <button type="button" onClick={() => setActive(i)} aria-current={i === active} className={`relative block aspect-square w-full overflow-hidden rounded-xl border-2 ${i === active ? 'border-signal' : 'border-transparent hover:border-stone-400'}`}>
                <Image src={im.url} alt="" fill sizes="72px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="group relative aspect-square cursor-zoom-in overflow-hidden rounded-2xl bg-stone-100"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
          }}
          onMouseLeave={() => setZoom(null)}
          onClick={() => setLightbox(true)}
          aria-label="Open full-screen image"
        >
          <Image
            src={img.url}
            alt={img.alt || name}
            fill
            priority
            sizes="(min-width:1024px) 55vw, 90vw"
            className="object-cover transition-transform duration-150"
            style={zoom ? { transform: 'scale(1.8)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
          />
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded bg-white/90 px-2 py-1 text-xs text-graphite opacity-0 group-hover:opacity-100">
            <ZoomIn size={14} /> Click to enlarge
          </span>
        </button>
      </div>
      <Videos videos={videos} />
      <Lightbox open={lightbox} onClose={() => setLightbox(false)} images={images} index={active} onIndex={setActive} name={name} />
    </div>
  );
}

function Videos({ videos }) {
  if (!videos?.length) return null;
  return (
    <div className="mt-6 space-y-4">
      {videos.map((v) => {
        const yt = v.url.match(/(?:youtu\.be\/|v=)([\w-]{11})/);
        return yt ? (
          <div key={v.url} className="aspect-video overflow-hidden rounded">
            <iframe src={`https://www.youtube-nocookie.com/embed/${yt[1]}`} title={v.title || 'Product video'} className="h-full w-full" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen />
          </div>
        ) : (
          <video key={v.url} src={v.url} controls preload="none" className="w-full rounded" aria-label={v.title || 'Product video'} />
        );
      })}
    </div>
  );
}
