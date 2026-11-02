'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';

/** Single image uploaded through the API (Cloudinary). Value: { url, publicId, width, height, alt } | null */
export default function ImageField({ label, hint, value, onChange, folder = 'content', className = '', noAlt = false }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function upload(file) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const img = await api(`/uploads/image?folder=${encodeURIComponent(folder)}`, { method: 'POST', body: fd });
      onChange({ ...(value || {}), ...img });
    } catch (err) {
      setError(err.status === 503 ? 'Image uploads are not configured (Cloudinary keys missing).' : err.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className={className}>
      {label ? <p className="label">{label}</p> : null}
      <div className="flex items-start gap-3">
        <div className="flex h-24 w-36 shrink-0 items-center justify-center overflow-hidden rounded border border-dashed border-stone-400 bg-stone-200">
          {value?.url ? <img src={value.url} alt={value.alt || ''} className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-graphite-400" aria-hidden />}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-outline btn-xs" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
              {value?.url ? 'Replace' : 'Upload image'}
            </button>
            {value?.url ? (
              <button type="button" className="btn-ghost btn-xs text-alert" onClick={() => onChange(null)}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            ) : null}
          </div>
          {value?.url && !noAlt ? <input className="input" placeholder="Alt text (describe the image)" value={value.alt || ''} onChange={(e) => onChange({ ...value, alt: e.target.value })} /> : null}
          {error ? <p className="error">{error}</p> : hint ? <p className="hint">{hint}</p> : <p className="hint">JPG, PNG or WebP, up to 8 MB.</p>}
        </div>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </div>
  );
}
