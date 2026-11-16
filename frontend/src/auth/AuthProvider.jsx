import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, postJson, setAuthToken, setUnauthorizedHandler } from '../api/client.js';
import { AuthContext } from '../hooks/useAuth.js';
import { navigate, parseHash } from '../lib/router.js';

// Token disimpan di sessionStorage: sesi berakhir saat tab/browser ditutup.
const KUNCI = 'satisview.sesi';

function bacaSesi() {
  try {
    const sesi = JSON.parse(window.sessionStorage.getItem(KUNCI) ?? 'null');
    if (sesi?.token && new Date(sesi.kedaluwarsa).getTime() > Date.now()) return sesi;
  } catch {
    /* penyimpanan tidak tersedia (mode privat) -> tanpa sesi tersimpan */
  }
  return null;
}

function simpanSesi(sesi) {
  try {
    if (sesi) window.sessionStorage.setItem(KUNCI, JSON.stringify(sesi));
    else window.sessionStorage.removeItem(KUNCI);
  } catch {
    /* abaikan: sesi tetap berlaku selama halaman terbuka */
  }
}

export function AuthProvider({ children }) {
  const [sesi, setSesi] = useState(() => {
    const awal = bacaSesi();
    setAuthToken(awal?.token ?? null);
    return awal;
  });
  const [pesan, setPesan] = useState(null);

  const terapkan = useCallback((baru) => {
    setAuthToken(baru?.token ?? null);
    simpanSesi(baru);
    setSesi(baru);
  }, []);

  const masuk = useCallback(
    async (username, password) => {
      const data = await postJson(api.login(), { username, password }, { withAuth: false });
      terapkan({ token: data.token, kedaluwarsa: data.kedaluwarsa, pengguna: data.pengguna });
      setPesan(null);
      return data.pengguna;
    },
    [terapkan],
  );

  const keluar = useCallback(
    (alasan = null) => {
      postJson(api.logout(), {}, { withAuth: false }).catch(() => {});
      terapkan(null);
      setPesan(alasan);
    },
    [terapkan],
  );

  // Token ditolak server (kedaluwarsa, password diganti, akun nonaktif) -> kembali ke login.
  useEffect(() => {
    setUnauthorizedHandler((alasan) => {
      terapkan(null);
      setPesan(alasan ?? 'Sesi Anda telah berakhir. Silakan masuk kembali.');
      const { raw } = parseHash();
      if (raw.startsWith('dashboard')) navigate(`/masuk?peran=pengelola&lanjut=${encodeURIComponent(raw)}`, { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [terapkan]);

  // Keluar otomatis saat token kedaluwarsa.
  useEffect(() => {
    if (!sesi) return undefined;
    const sisa = new Date(sesi.kedaluwarsa).getTime() - Date.now();
    const id = window.setTimeout(() => {
      terapkan(null);
      setPesan('Sesi Anda telah berakhir. Silakan masuk kembali.');
      if (parseHash().raw.startsWith('dashboard')) navigate('/masuk?peran=pengelola', { replace: true });
    }, Math.max(0, Math.min(sisa, 2_147_000_000)));
    return () => window.clearTimeout(id);
  }, [sesi, terapkan]);

  const value = useMemo(
    () => ({ pengguna: sesi?.pengguna ?? null, masuk, keluar, pesan, hapusPesan: () => setPesan(null) }),
    [sesi, masuk, keluar, pesan],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
