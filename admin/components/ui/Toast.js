'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

const Ctx = createContext({ show: () => {} });

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const id = useRef(0);
  const dismiss = useCallback((k) => setItems((l) => l.filter((t) => t.id !== k)), []);
  const show = useCallback(
    (message, tone = 'ok') => {
      const k = ++id.current;
      setItems((l) => [...l.slice(-3), { id: k, message, tone }]);
      setTimeout(() => dismiss(k), tone === 'error' ? 8000 : 4000);
    },
    [dismiss]
  );
  const value = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite" role="status">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex items-start gap-2.5 rounded border px-3.5 py-3 text-sm shadow-lg ${t.tone === 'error' ? 'border-alert/30 bg-white text-alert' : 'border-graphite bg-graphite text-white'}`}>
            {t.tone === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-signal" />}
            <p className="flex-1">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
