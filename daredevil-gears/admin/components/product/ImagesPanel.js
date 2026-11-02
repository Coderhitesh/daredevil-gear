'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Trash2, Upload, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { Spinner, Notice } from '@/components/ui';

/** Product photos: upload (Cloudinary via API), reorder, alt text, remove. First image is the cover. */
export default function ImagesPanel({ product }) {
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef(null);
  const [images, setImages] = useState(product.images || []);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(images) !== JSON.stringify(product.images || []);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['product', product._id] });
    qc.invalidateQueries({ queryKey: ['/products'] });
    qc.invalidateQueries({ queryKey: ['products-summary'] });
  };

  async function upload(files) {
    if (!files.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      [...files].slice(0, 10).forEach((f) => fd.append('files', f));
      const next = await api(`/products/${product._id}/images`, { method: 'POST', body: fd });
      setImages(next);
      toast.show(`${files.length} photo${files.length > 1 ? 's' : ''} added`);
      refresh();
    } catch (err) {
      toast.show(err.code === 'UPLOADS_NOT_CONFIGURED' ? 'Photo uploads need Cloudinary keys in the API environment.' : err.message, 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function save() {
    setBusy(true);
    try {
      const body = { images: images.map(({ url, publicId, alt, width, height }) => ({ url, publicId, alt: alt || undefined, width, height })) };
      setImages(await api(`/products/${product._id}/images`, { method: 'PUT', body }));
      toast.show('Photos saved');
      refresh();
    } catch (err) {
      toast.show(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    setImages(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-graphite-600">Use real photos of the product you ship, on a plain background. At least 1200 px on the long side. The first photo is the cover.</p>
        <div className="flex gap-2">
          {dirty ? (
            <button type="button" className="btn-dark" onClick={save} disabled={busy}>
              {busy ? <Spinner /> : null} Save order & text
            </button>
          ) : null}
          <button type="button" className="btn-outline" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Spinner /> : <Upload className="h-4 w-4" />} Upload photos
          </button>
        </div>
      </div>
      {!images.length ? <Notice tone="caution" title="No photos yet">The storefront shows a branded placeholder until photos are added. Products without photos convert poorly.</Notice> : null}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {images.map((img, i) => (
          <li key={img.publicId || img.url} className="overflow-hidden rounded border border-stone-300 bg-white">
            <div className="relative aspect-square bg-stone-200">
              <img src={img.url} alt={img.alt || ''} className="h-full w-full object-cover" />
              {i === 0 ? (
                <span className="absolute left-2 top-2 pill bg-ink text-white">
                  <Star className="h-3 w-3" /> Cover
                </span>
              ) : null}
            </div>
            <div className="space-y-2 p-2">
              <input className="input text-xs" placeholder="Describe the photo (alt text)" value={img.alt || ''} onChange={(e) => setImages(images.map((x, k) => (k === i ? { ...x, alt: e.target.value } : x)))} aria-label={`Alt text for photo ${i + 1}`} />
              <div className="flex justify-between">
                <span className="flex gap-1">
                  <button type="button" className="btn-ghost btn-xs" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move left">
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="btn-ghost btn-xs" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label="Move right">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </span>
                <button type="button" className="btn-ghost btn-xs text-alert" onClick={() => setImages(images.filter((_, k) => k !== i))} aria-label="Remove photo">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {dirty ? <p className="text-xs text-caution">Unsaved photo changes. Removed photos are deleted from storage when you save.</p> : null}
      <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files || [])} />
    </div>
  );
}
