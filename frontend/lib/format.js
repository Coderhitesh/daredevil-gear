import { formatINR } from '@/lib/shared';

export const inr = (paise, opts) => formatINR(paise, opts);

export function date(d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-IN', opts).format(new Date(d));
}

export function dateTime(d) {
  return date(d, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Product copy is stored as plain text with blank-line paragraphs. */
export function paragraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export const STATUS_TONE = {
  pending_payment: 'warn',
  payment_failed: 'bad',
  confirmed: 'info',
  processing: 'info',
  shipped: 'info',
  out_for_delivery: 'info',
  delivered: 'good',
  cancellation_requested: 'warn',
  cancelled: 'muted',
  return_requested: 'warn',
  returned: 'muted',
  refunded: 'muted',
  partially_refunded: 'muted',
  expired: 'muted',
};

/** "Estimated delivery by Nov 04, 2026" (Shiprocket ETD) or "Usually 3–5 working days after dispatch". */
export function deliveryEta(o) {
  if (!o) return '';
  if (o.etd) return `Estimated delivery by ${o.etd}`;
  const d = o.estimatedDays;
  if (!d?.max) return '';
  return d.min && d.min !== d.max ? `Usually ${d.min}–${d.max} working days after dispatch` : `Usually ${d.max} working day${d.max > 1 ? 's' : ''} after dispatch`;
}
