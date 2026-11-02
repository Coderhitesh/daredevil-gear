'use client';

import { useFieldArray } from 'react-hook-form';
import { Plus, Trash2, ArrowUp, EyeOff } from 'lucide-react';

/** Specifications table editor (label/value, public toggle). */
export default function SpecsEditor({ form }) {
  const { control, register } = form;
  const { fields, append, remove, move } = useFieldArray({ control, name: 'specifications' });
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="label mb-0">Specifications</p>
        <button type="button" className="btn-ghost btn-xs" onClick={() => append({ label: '', value: '', isPublic: true })}>
          <Plus className="h-3.5 w-3.5" /> Add row
        </button>
      </div>
      {fields.length ? (
        <div className="overflow-hidden rounded border border-stone-400">
          {fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-[1fr_2fr_auto] items-center gap-2 border-b border-stone-200 p-2 last:border-0">
              <input className="input" placeholder="Label" aria-label={`Specification ${i + 1} label`} {...register(`specifications.${i}.label`)} />
              <input className="input" placeholder="Value" aria-label={`Specification ${i + 1} value`} {...register(`specifications.${i}.value`)} />
              <div className="flex items-center gap-1">
                <label className="flex items-center gap-1 text-xs text-graphite-600" title="Shown on the product page">
                  <input type="checkbox" className="accent-signal" {...register(`specifications.${i}.isPublic`)} /> Public
                </label>
                <button type="button" className="btn-ghost btn-xs" onClick={() => i > 0 && move(i, i - 1)} disabled={i === 0} aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" className="btn-ghost btn-xs text-alert" onClick={() => remove(i)} aria-label="Remove row">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded border border-dashed border-stone-400 px-3 py-3 text-sm text-graphite-400">No specifications.</p>
      )}
      <p className="hint flex items-center gap-1">
        <EyeOff className="h-3 w-3" /> Rows with placeholders or internal notes were hidden automatically during import. Keep unverified test results private.
      </p>
    </div>
  );
}
