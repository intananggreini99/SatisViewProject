import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

/** Sesi login pengelola dashboard: { pengguna, masuk(), keluar(), pesan, hapusPesan() }. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  return ctx;
}
