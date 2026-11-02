'use client';

import { useRef } from 'react';

/** Six single-digit boxes; supports paste and one-time-code autofill. */
export default function OtpInput({ value, onChange, disabled, error }) {
  const refs = useRef([]);
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');
  const setAt = (i, d) => {
    const arr = value.padEnd(6, ' ').split('');
    arr[i] = d;
    onChange(arr.join('').replace(/\s+$/, '').replace(/\s/g, ''));
  };
  return (
    <div className="flex gap-2" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={i === 0 ? 6 : 1}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={Boolean(error)}
          disabled={disabled}
          value={d.trim()}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            if (v.length > 1) {
              onChange(v.slice(0, 6));
              refs.current[Math.min(5, v.length)]?.focus();
              return;
            }
            setAt(i, v);
            if (v && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d.trim() && i > 0) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            const v = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            if (v) {
              e.preventDefault();
              onChange(v);
              refs.current[Math.min(5, v.length - 1)]?.focus();
            }
          }}
          className="input tabular h-14 w-12 text-center font-display text-2xl font-semibold"
        />
      ))}
    </div>
  );
}
