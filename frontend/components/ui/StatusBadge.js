import { STATUS_TONE } from '@/lib/format';

const TONE = {
  good: 'bg-[#E3F0E5] text-okay',
  warn: 'bg-signal-light text-signal-dark',
  bad: 'bg-[#FBE3E1] text-alert',
  info: 'bg-stone-200 text-graphite',
  muted: 'bg-stone-200 text-graphite-400',
};

export default function StatusBadge({ status, label }) {
  return <span className={`tag ${TONE[STATUS_TONE[status] || 'info']}`}>{label || status}</span>;
}
