'use client';

import { Minus, Plus } from 'lucide-react';

export default function QuantityStepper({ value, onChange, min = 1, max = 10, disabled = false, label = 'Quantity' }) {
  const btn = 'inline-flex h-10 w-10 items-center justify-center text-graphite hover:bg-stone-200 disabled:opacity-40';
  return (
    <div className="inline-flex items-center rounded border border-stone-400 bg-white" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={disabled || value <= min} aria-label="Decrease quantity">
        <Minus size={16} />
      </button>
      <span className="tabular w-9 text-center font-medium" aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={disabled || value >= max} aria-label="Increase quantity">
        <Plus size={16} />
      </button>
    </div>
  );
}
