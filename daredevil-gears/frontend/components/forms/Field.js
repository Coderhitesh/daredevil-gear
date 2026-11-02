'use client';

import { forwardRef, useId } from 'react';

/** Labelled input wired for accessibility (aria-invalid / aria-describedby). */
const Field = forwardRef(function Field({ label, error, hint, className = '', as = 'input', children, required, ...props }, ref) {
  const id = useId();
  const Comp = as;
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {required ? <span className="text-signal-dark"> *</span> : null}
      </label>
      <Comp id={id} ref={ref} className={as === 'textarea' ? 'input min-h-[120px]' : 'input'} aria-invalid={Boolean(error)} aria-describedby={describedBy} aria-required={required || undefined} {...props}>
        {children}
      </Comp>
      {hint && !error ? (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-err`} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});

export default Field;
