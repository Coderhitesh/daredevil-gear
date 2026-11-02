'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export default function Lightbox({ open, onClose, images, index, onIndex, name }) {
  useEffect(() => {
    if (!open) return undefined;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex((index + 1) % images.length);
      if (e.key === 'ArrowLeft') onIndex((index - 1 + images.length) % images.length);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.removeProperty('overflow');
    };
  }, [open, index, images.length, onClose, onIndex]);

  if (!open) return null;
  const img = images[index];
  const nav = 'absolute top-1/2 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20';
  return (
    <div className="fixed inset-0 z-[70] bg-ink/95" role="dialog" aria-modal="true" aria-label={`${name} images`}>
      <button type="button" onClick={onClose} className="absolute right-4 top-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close" autoFocus>
        <X size={22} />
      </button>
      <div className="relative h-full w-full">
        <Image src={img.url} alt={img.alt || name} fill sizes="100vw" className="object-contain p-6 sm:p-12" />
      </div>
      {images.length > 1 ? (
        <>
          <button type="button" className={`${nav} left-4`} onClick={() => onIndex((index - 1 + images.length) % images.length)} aria-label="Previous image">
            <ChevronLeft />
          </button>
          <button type="button" className={`${nav} right-4`} onClick={() => onIndex((index + 1) % images.length)} aria-label="Next image">
            <ChevronRight />
          </button>
          <p className="tabular absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-stone-300">
            {index + 1} / {images.length}
          </p>
        </>
      ) : null}
    </div>
  );
}
