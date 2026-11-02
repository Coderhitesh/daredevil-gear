'use client';

import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Loader2, Search, X, Inbox } from 'lucide-react';
import { humanize } from '@/lib/format';

// ---------------------------------------------------------------- layout

export function PageHeader({ title, description, actions, back }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="font-display text-[2rem] font-semibold leading-none">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-graphite-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, actions, children, className = '', bodyClass = 'card-body' }) {
  return (
    <section className={`card ${className}`}>
      {title || actions ? (
        <header className="card-head">
          {title ? <h2 className="card-title">{title}</h2> : <span />}
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function KeyValue({ rows }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,35%)_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.filter(Boolean).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-graphite-400">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Empty({ title = 'Nothing here yet', children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <Inbox className="h-8 w-8 text-stone-400" aria-hidden />
      <p className="mt-3 font-medium">{title}</p>
      {children ? <p className="mt-1 max-w-md text-graphite-400">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Spinner({ className = 'h-4 w-4' }) {
  return <Loader2 className={`${className} animate-spin`} aria-hidden />;
}

export function Notice({ tone = 'caution', title, children, action }) {
  const tones = {
    caution: 'border-caution/30 bg-caution-light text-caution',
    alert: 'border-alert/30 bg-alert-light text-alert',
    okay: 'border-okay/30 bg-okay-light text-okay',
    info: 'border-stone-400 bg-stone-200 text-graphite',
  };
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 rounded border px-4 py-3 text-sm ${tones[tone]}`} role={tone === 'alert' ? 'alert' : undefined}>
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="mt-0.5 text-graphite">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- status

const TONE = {
  // orders
  pending_payment: 'muted', payment_failed: 'alert', confirmed: 'signal', processing: 'signal', shipped: 'olive', out_for_delivery: 'olive', delivered: 'okay',
  cancellation_requested: 'caution', cancelled: 'muted', return_requested: 'caution', returned: 'muted', refunded: 'muted', partially_refunded: 'caution', expired: 'muted',
  // payments
  created: 'muted', authorized: 'caution', captured: 'okay', failed: 'alert',
  // products
  draft: 'muted', review: 'caution', published: 'okay', archived: 'muted',
  // generic
  active: 'okay', suspended: 'alert', deleted: 'muted', pending: 'caution', approved: 'okay', rejected: 'alert', processed: 'okay',
  open: 'caution', acknowledged: 'signal', in_progress: 'signal', resolved: 'okay', closed: 'muted', new: 'caution', requested: 'caution',
  pickup_scheduled: 'signal', received: 'olive', refund_initiated: 'caution', subscribed: 'okay', unsubscribed: 'muted', sent: 'okay', queued: 'muted',
  cod_pending: 'caution', in_stock: 'okay', out_of_stock: 'alert', blocking: 'alert', warning: 'caution',
};
const TONE_CLASS = {
  muted: 'bg-stone-200 text-graphite-600',
  signal: 'bg-signal-light text-signal-dark',
  olive: 'bg-olive-light text-olive',
  okay: 'bg-okay-light text-okay',
  alert: 'bg-alert-light text-alert',
  caution: 'bg-caution-light text-caution',
};

export function Status({ value, label, tone }) {
  if (!value && !label) return <span className="text-graphite-400">—</span>;
  return <span className={`pill ${TONE_CLASS[tone || TONE[value] || 'muted']}`}>{label || humanize(value)}</span>;
}

export function Pill({ tone = 'muted', children }) {
  return <span className={`pill ${TONE_CLASS[tone]}`}>{children}</span>;
}

// ---------------------------------------------------------------- tables

/**
 * columns: [{ key, label, render(row), className, align }]
 */
export function DataTable({ columns, rows, isLoading, error, empty, onRowClick, rowKey = (r) => r._id || r.id, footer }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`${c.align === 'right' ? 'text-right' : ''} ${c.className || ''}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && !rows?.length
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key}>
                        <div className="skeleton h-4 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((r) => (
                  <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? 'cursor-pointer' : ''}>
                    {columns.map((c) => (
                      <td key={c.key} className={`${c.align === 'right' ? 'text-right tabular' : ''} ${c.className || ''}`}>
                        {c.render ? c.render(r) : r[c.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {error ? <p className="px-4 py-6 text-center text-alert">{error.message}</p> : null}
      {!isLoading && !error && !rows?.length ? empty || <Empty /> : null}
      {footer}
    </div>
  );
}

export function Pager({ meta, onPage }) {
  if (!meta || meta.totalPages <= 1) return meta ? <p className="px-4 py-2.5 text-xs text-graphite-400">{meta.total} total</p> : null;
  return (
    <div className="flex items-center justify-between border-t border-stone-300 px-4 py-2.5 text-sm">
      <span className="text-graphite-400 tabular">
        Page {meta.page} of {meta.totalPages}, {meta.total} total
      </span>
      <div className="flex gap-1">
        <button type="button" className="btn-outline btn-xs" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" className="btn-outline btn-xs" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function Toolbar({ children }) {
  return <div className="mb-3 flex flex-wrap items-center gap-2">{children}</div>;
}

export function SearchInput({ value, onChange, placeholder = 'Search', className = 'w-full sm:w-72' }) {
  const [v, setV] = useState(value || '');
  const first = useRef(true);
  useEffect(() => setV(value || ''), [value]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const t = setTimeout(() => v !== (value || '') && onChange(v), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" aria-hidden />
      <input type="search" className="input pl-8" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function FilterSelect({ label, value, onChange, options, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="sr-only">{label}</span>
      <select className="input w-auto pr-8" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{label}: all</option>
        {options.map((o) => {
          const [val, text] = Array.isArray(o) ? o : [o, humanize(o)];
          return (
            <option key={val} value={val}>
              {text}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-stone-300" role="tablist">
      {tabs.map((t) => {
        const [key, label, badge] = Array.isArray(t) ? t : [t, humanize(t)];
        const on = key === value;
        return (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(key)}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${on ? 'border-signal text-ink' : 'border-transparent text-graphite-400 hover:text-graphite'}`}
          >
            {label}
            {badge ? <span className="pill bg-alert-light text-alert">{badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- form fields

export function Field({ label, hint, error, required, children, className = '', id: idProp }) {
  const auto = useId();
  const id = idProp || auto;
  const child = typeof children === 'function' ? children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': hint || error ? `${id}-d` : undefined }) : children;
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={id} className="label">
          {label}
          {required ? <span className="text-signal"> *</span> : null}
        </label>
      ) : null}
      {child}
      {error ? (
        <p id={`${id}-d`} className="error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-d`} className="hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ label, hint, error, required, className, ...props }, ref) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(a) => <input ref={ref} className="input" {...a} {...props} />}
    </Field>
  );
});

export const Textarea = forwardRef(function Textarea({ label, hint, error, required, className, rows = 4, ...props }, ref) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(a) => <textarea ref={ref} rows={rows} className="input font-[inherit]" {...a} {...props} />}
    </Field>
  );
});

export const Select = forwardRef(function Select({ label, hint, error, required, className, options = [], placeholder, ...props }, ref) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(a) => (
        <select ref={ref} className="input" {...a} {...props}>
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((o) => {
            const [val, text] = Array.isArray(o) ? o : [o, humanize(o)];
            return (
              <option key={String(val)} value={val}>
                {text}
              </option>
            );
          })}
        </select>
      )}
    </Field>
  );
});

export const Checkbox = forwardRef(function Checkbox({ label, hint, className = '', ...props }, ref) {
  return (
    <label className={`flex items-start gap-2.5 text-sm ${className}`}>
      <input ref={ref} type="checkbox" className="mt-0.5 h-4 w-4 accent-signal" {...props} />
      <span>
        {label}
        {hint ? <span className="block text-xs text-graphite-400">{hint}</span> : null}
      </span>
    </label>
  );
});

// ---------------------------------------------------------------- overlays

function useFocusTrap(open, ref, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const node = ref.current;
    const focusables = () => node?.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') || [];
    const first = [...focusables()].find((el) => !el.disabled && el.dataset.autofocus !== 'false');
    (node?.querySelector('[data-autofocus]') || first)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key !== 'Tab') return;
      const list = [...focusables()].filter((el) => !el.disabled);
      if (!list.length) return;
      if (e.shiftKey && document.activeElement === list[0]) {
        e.preventDefault();
        list[list.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === list[list.length - 1]) {
        e.preventDefault();
        list[0].focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.removeProperty('overflow');
      prev?.focus?.();
    };
  }, [open, ref, onClose]);
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null);
  useFocusTrap(open, ref, onClose);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size];
  // portalled so dialogs containing forms are never nested inside a page form
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onSubmit={(e) => e.stopPropagation()} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[92vh] w-full ${w} flex-col rounded-t bg-white shadow-2xl sm:rounded`}>
        <header className="flex items-center justify-between border-b border-stone-300 px-5 py-3.5">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button type="button" className="btn-ghost -mr-2" onClick={onClose} aria-label="Close" data-autofocus="false">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-stone-300 px-5 py-3">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  );
}

export function Drawer({ open, onClose, title, children, footer, width = 'max-w-2xl' }) {
  const ref = useRef(null);
  useFocusTrap(open, ref, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onSubmit={(e) => e.stopPropagation()} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`flex h-full w-full ${width} flex-col bg-white shadow-2xl`}>
        <header className="flex items-center justify-between border-b border-stone-300 px-5 py-3.5">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button type="button" className="btn-ghost -mr-2" onClick={onClose} aria-label="Close" data-autofocus="false">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-stone-300 bg-paper px-5 py-3">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  );
}

/**
 * Confirmation with optional required reason (min length). onConfirm(reason) may return a promise.
 */
export function Confirm({ open, onClose, title, children, confirmLabel = 'Confirm', tone = 'dark', reason, reasonLabel = 'Reason', reasonMin = 3, busy, onConfirm }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText('');
  }, [open]);
  const tooShort = reason && text.trim().length < reasonMin;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={tone === 'danger' ? 'btn-danger' : tone === 'primary' ? 'btn-primary' : 'btn-dark'} disabled={busy || tooShort} onClick={() => onConfirm(text.trim())}>
            {busy ? <Spinner /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-graphite">
        {children}
        {reason ? <Textarea label={reasonLabel} required rows={3} value={text} onChange={(e) => setText(e.target.value)} hint={reasonMin > 3 ? `At least ${reasonMin} characters. Saved to the audit log.` : 'Saved to the audit log.'} /> : null}
      </div>
    </Modal>
  );
}
