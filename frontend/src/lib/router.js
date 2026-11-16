import { useEffect, useState } from 'react';

// Router hash sederhana: #/  #/masuk  #/kuesioner/<kelompok>  #/dashboard/<kelompok>/<tab>
// Hash dipakai agar Nginx/Vite cukup menyajikan satu index.html.
export function parseHash(hash = window.location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  return {
    segments: path.split('/').filter(Boolean).map((s) => decodeURIComponent(s)),
    query: new URLSearchParams(query),
    raw,
  };
}

export function navigate(to, { replace = false } = {}) {
  const url = to.startsWith('#') ? to : `#${to.startsWith('/') ? to : `/${to}`}`;
  if (url === window.location.hash) return;
  if (replace) {
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = url;
  }
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash());
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    window.addEventListener('popstate', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
      window.removeEventListener('popstate', onChange);
    };
  }, []);
  return route;
}
