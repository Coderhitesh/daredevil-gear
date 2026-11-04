'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Accessible side drawer: focus trap, Escape to close, scroll lock, returns focus to the opener.
 */
export default function Drawer({ open, onClose, title, side = 'right', children, footer, width = 'max-w-md' }) {
  const panel = useRef(null);
  const opener = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    opener.current = document.activeElement;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => panel.current?.querySelector('[data-autofocus], button, a, input')?.focus(), 50);
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && panel.current) {
        const f = [...panel.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.removeProperty('overflow');
      opener.current?.focus?.();
    };
  }, [open]);

  const x = side === 'right' ? '100%' : '-100%';
  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50" role="presentation">
          <motion.div className="absolute inset-0 bg-ink/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`absolute top-0 ${side === 'right' ? 'right-0' : 'left-0'} flex h-full w-full ${width} flex-col bg-paper text-ink shadow-2xl`}
            initial={{ x }}
            animate={{ x: 0 }}
            exit={{ x }}
            transition={{ type: 'tween', duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-stone-300 px-5">
              <h2 className="font-display text-xl">{title}</h2>
              <button type="button" onClick={onClose} className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded hover:bg-stone-200" aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{children}</div>
            {footer ? <div className="shrink-0 border-t border-stone-300 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 sm:pb-[max(1.25rem,env(safe-area-inset-bottom))]">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
