import { createContext, useContext } from 'react';

/** Konteks notifikasi (toast); penyedianya ada di components/Toast.jsx. */
export const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast harus dipakai di dalam <ToastProvider>');
  return ctx;
}
