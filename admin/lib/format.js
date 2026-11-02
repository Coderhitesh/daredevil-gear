import { formatINR, ORDER_STATUS_LABEL } from '@/lib/shared';

export { formatINR, ORDER_STATUS_LABEL };

export const inr = (paise, opts) => (paise === null || paise === undefined ? '—' : formatINR(paise, opts));

/** Rupees (string/number typed by an admin) → integer paise. */
export function toPaise(rupees) {
  if (rupees === '' || rupees === null || rupees === undefined) return undefined;
  const n = Number(String(rupees).replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

/** Integer paise → rupee string for inputs. */
export function toRupees(paise) {
  if (paise === null || paise === undefined || paise === '') return '';
  const v = Number(paise) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

const dtf = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
const df = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export const dateTime = (d) => (d ? dtf.format(new Date(d)) : '—');
export const date = (d) => (d ? df.format(new Date(d)) : '—');

export function ago(d) {
  if (!d) return '—';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return date(d);
}

/** For <input type="datetime-local"> in IST-ish local time. */
export function toLocalInput(d) {
  if (!d) return '';
  const dt = new Date(d);
  const off = dt.getTimezoneOffset();
  return new Date(dt.getTime() - off * 60000).toISOString().slice(0, 16);
}

export const humanize = (s) => String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const storefrontUrl = (path = '') => `${process.env.NEXT_PUBLIC_STOREFRONT_URL || ''}${path}`;

const METHOD = { cod: 'Cash on delivery', upi: 'UPI', card: 'Card', netbanking: 'Net banking', wallet: 'Wallet', emi: 'EMI', paylater: 'Pay later' };
export const paymentMethod = (m) => (m ? METHOD[m] || humanize(m) : '—');
