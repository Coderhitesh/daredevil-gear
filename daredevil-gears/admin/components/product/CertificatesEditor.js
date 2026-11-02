'use client';

import { useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import { Plus, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';

/**
 * Certificates / test reports. A certificate is only shown to customers when marked verified,
 * and only verified documents may back a performance claim (e.g. a ballistic or flame rating).
 */
export default function CertificatesEditor({ form }) {
  const { control, register, setValue, watch } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'compliance.certificates' });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function upload(i, file) {
    setBusy(i);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const doc = await api('/uploads/document', { method: 'POST', body: fd });
      setValue(`compliance.certificates.${i}.fileUrl`, doc.url, { shouldDirty: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="label mb-0">Certificates & test reports</p>
        <button type="button" className="btn-ghost btn-xs" onClick={() => append({ name: '', standard: '', issuedBy: '', fileUrl: '', verified: false })}>
          <Plus className="h-3.5 w-3.5" /> Add document
        </button>
      </div>
      {fields.length ? (
        <div className="space-y-2">
          {fields.map((f, i) => {
            const url = watch(`compliance.certificates.${i}.fileUrl`);
            return (
              <div key={f.id} className="grid gap-2 rounded border border-stone-400 p-3 sm:grid-cols-3">
                <input className="input" placeholder="Document name" aria-label="Document name" {...register(`compliance.certificates.${i}.name`)} />
                <input className="input" placeholder="Standard (e.g. IS 17051)" aria-label="Standard" {...register(`compliance.certificates.${i}.standard`)} />
                <input className="input" placeholder="Issued by (lab)" aria-label="Issued by" {...register(`compliance.certificates.${i}.issuedBy`)} />
                <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="link text-sm">
                      View file
                    </a>
                  ) : (
                    <span className="text-sm text-caution">No file attached</span>
                  )}
                  <label className="btn-outline btn-xs cursor-pointer">
                    {busy === i ? <Spinner className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />} {url ? 'Replace file' : 'Upload PDF'}
                    <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => e.target.files?.[0] && upload(i, e.target.files[0])} />
                  </label>
                  <label className="ml-auto flex items-center gap-1.5 text-sm">
                    <input type="checkbox" className="accent-signal" {...register(`compliance.certificates.${i}.verified`)} /> I have checked this document is genuine and current
                  </label>
                  <button type="button" className="btn-ghost btn-xs text-alert" onClick={() => remove(i)} aria-label="Remove document">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded border border-dashed border-stone-400 px-3 py-3 text-sm text-graphite-400">No documents. Products claiming a protection rating must not be published without one.</p>
      )}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
