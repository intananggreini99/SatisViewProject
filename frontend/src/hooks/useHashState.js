import { useCallback, useEffect, useState } from 'react';
import { GROUPS, SEMUA, TABS } from '../lib/constants.js';

// Status tampilan disimpan di URL (#/mahasiswa/kpi?segmen=...) agar bisa
// dibagikan, di-bookmark, dan tombol Back browser tetap berfungsi.
function parse() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const [groupKey, tabKey] = path.split('/');
  const params = new URLSearchParams(query);
  const group = GROUPS.some((g) => g.key === groupKey) ? groupKey : GROUPS[0].key;
  const tab = TABS.some((t) => t.key === tabKey) ? tabKey : TABS[0].key;
  return { group, tab, segment: params.get('segmen') || SEMUA };
}

function build({ group, tab, segment }) {
  const query = segment && segment !== SEMUA ? `?segmen=${encodeURIComponent(segment)}` : '';
  return `#/${group}/${tab}${query}`;
}

export function useHashState() {
  const [state, setState] = useState(parse);

  useEffect(() => {
    const onHash = () => setState(parse());
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    if (!window.location.hash) window.history.replaceState(null, '', build(parse()));
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);

  const update = useCallback((patch, { replace = false } = {}) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.group && patch.group !== prev.group && !('segment' in patch)) next.segment = SEMUA;
      const url = build(next);
      if (url !== window.location.hash) {
        if (replace) window.history.replaceState(null, '', url);
        else window.history.pushState(null, '', url);
      }
      return next;
    });
  }, []);

  return [state, update];
}
