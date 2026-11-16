import { useCallback, useMemo, useRef, useState } from 'react';
import { ToastContext } from '../hooks/useToast.js';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './Icons.jsx';

const STYLES = {
  success: { icon: CheckIcon, ring: 'border-l-good', iconCls: 'bg-good-soft text-good' },
  error: { icon: AlertIcon, ring: 'border-l-bad', iconCls: 'bg-bad-soft text-bad' },
  info: { icon: InfoIcon, ring: 'border-l-gold', iconCls: 'bg-gold-100 text-gold-700' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const notify = useCallback(
    ({ type = 'info', title, message, duration = 5500 }) => {
      const id = ++idRef.current;
      setToasts((list) => [...list.slice(-3), { id, type, title, message }]);
      if (duration) window.setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-end gap-3 sm:inset-x-auto sm:right-6"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => {
          const style = STYLES[toast.type] ?? STYLES.info;
          const Icon = style.icon;
          return (
            <div
              key={toast.id}
              role={toast.type === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex w-full max-w-sm animate-fade-in items-start gap-3 rounded-2xl border border-l-[5px] border-line bg-white px-4 py-3 shadow-pop ${style.ring}`}
            >
              <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${style.iconCls}`}>
                <Icon size={16} strokeWidth={2.6} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-brand-900">{toast.title}</p>
                {toast.message && <p className="mt-0.5 text-sm text-ink-soft">{toast.message}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="-mr-1 rounded-full p-1 text-ink-muted transition hover:bg-brand-50 hover:text-brand"
                aria-label="Tutup notifikasi"
              >
                <CloseIcon size={18} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
