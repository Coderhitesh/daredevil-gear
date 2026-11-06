'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ZoomIn } from 'lucide-react';
import { Placeholder } from './ProductThumb';
import Lightbox from '../ui/Lightbox';

/** Image gallery with hover zoom (desktop), tap-to-switch thumbnails (mobile) and a full-screen viewer. */
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
      {/* one layout for every screen: main image + thumbnails (below on mobile, left column from md) */}
      <div className={`grid gap-3 md:gap-4 ${images.length > 1 ? 'md:grid-cols-[72px_minmax(0,1fr)]' : ''}`}>
        <button
          type="button"
          className={`group relative aspect-square w-full cursor-zoom-in overflow-hidden rounded-2xl bg-stone-100 ${images.length > 1 ? 'md:order-2' : ''}`}
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
            sizes="(min-width:1024px) 55vw, 100vw"
            className="object-cover transition-transform duration-150"
            style={zoom ? { transform: 'scale(1.8)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
          />
          {images.length > 1 ? (
            <span className="tabular absolute left-3 top-3 rounded-full bg-night/70 px-2.5 py-1 text-xs font-medium text-white md:hidden">
              {active + 1} / {images.length}
            </span>
          ) : null}
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded bg-white/90 px-2 py-1 text-xs text-graphite md:opacity-0 md:group-hover:opacity-100">
            <ZoomIn size={14} /> <span className="hidden md:inline">Click to enlarge</span>
            <span className="md:hidden">Tap to zoom</span>
          </span>
        </button>
        {images.length > 1 ? (
          <ul className="grid grid-cols-5 gap-2 sm:grid-cols-6 md:order-1 md:grid-cols-1 md:content-start" aria-label="Choose image">
            {images.map((im, i) => (
              <li key={im.url}>
                <button type="button" onClick={() => setActive(i)} aria-current={i === active} aria-label={`Show image ${i + 1}`} className={`relative block aspect-square w-full overflow-hidden rounded-xl border-2 bg-stone-100 ${i === active ? 'border-signal' : 'border-transparent hover:border-stone-400'}`}>
                  <Image src={im.url} alt="" fill sizes="72px" className="object-cover" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
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
