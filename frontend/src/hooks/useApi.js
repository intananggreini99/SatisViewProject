import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../api/client.js';

/**
 * Ambil data JSON dari API.
 * - `loading`    : true hanya saat belum ada data sama sekali (tampilkan skeleton)
 * - `refreshing` : true saat filter berubah; data lama tetap tampil (diredupkan)
 */
export function useApi(url) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(url), refreshing: false });
  const [nonce, setNonce] = useState(0);
  const hasData = useRef(false);

  useEffect(() => {
    if (!url) return undefined;
    const controller = new AbortController();
    setState((prev) => ({
      ...prev,
      error: null,
      loading: !hasData.current,
      refreshing: hasData.current,
    }));
    fetchJson(url, { signal: controller.signal })
      .then((data) => {
        hasData.current = true;
        setState({ data, error: null, loading: false, refreshing: false });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState((prev) => ({ ...prev, error, loading: false, refreshing: false }));
      });
    return () => controller.abort();
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
