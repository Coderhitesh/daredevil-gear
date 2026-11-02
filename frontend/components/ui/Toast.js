'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { useUi } from '@/lib/store';

const tones = {
  good: { icon: CheckCircle2, cls: 'border-l-okay' },
  warn: { icon: AlertTriangle, cls: 'border-l-signal' },
  bad: { icon: AlertTriangle, cls: 'border-l-alert' },
  info: { icon: Info, cls: 'border-l-graphite' },
};

export default function Toast() {
  const toast = useUi((s) => s.toast);
  const clear = useUi((s) => s.clearToast);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(clear, toast.tone === 'bad' ? 7000 : 4000);
    return () => clearTimeout(t);
  }, [toast, clear]);
  const tone = tones[toast?.tone] || tones.info;
  const Icon = tone.icon;
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
      <AnimatePresence>
        {toast ? (
          <motion.div key={toast.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className={`pointer-events-auto flex max-w-md items-start gap-3 rounded border border-l-4 border-stone-300 bg-white px-4 py-3 shadow-lg ${tone.cls}`}>
            <Icon size={18} className="mt-0.5 shrink-0" />
            <p className="text-sm text-ink">{toast.message}</p>
            <button type="button" onClick={clear} aria-label="Dismiss" className="-mr-1 shrink-0 text-graphite-400 hover:text-ink">
              <X size={16} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
