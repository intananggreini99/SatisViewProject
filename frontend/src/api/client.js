// Pembungkus fetch: timeout, JSON, dan pesan error yang ramah pengguna.
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function anySignal(signals) {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

export async function fetchJson(url, { signal, timeoutMs = 20_000 } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? anySignal([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetch(url, { signal: combined, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) throw new ApiError('Server terlalu lama merespons. Coba lagi.', 0);
    throw new ApiError('Tidak dapat terhubung ke server dashboard.', 0);
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new ApiError(body?.error ?? `Permintaan gagal (HTTP ${response.status}).`, response.status);
  }
  return body;
}

const enc = encodeURIComponent;

export const api = {
  groups: () => '/api/groups',
  segments: (group) => `/api/groups/${enc(group)}/segments`,
  kpi: (group, segment) => `/api/groups/${enc(group)}/kpi?segmen=${enc(segment)}`,
  mapping: (group, segment) => `/api/groups/${enc(group)}/mapping?segmen=${enc(segment)}`,
  topics: (group, segment) => `/api/groups/${enc(group)}/topics?segmen=${enc(segment)}`,
  comments: (group, { segment, topic, search, limit, offset }) =>
    `/api/groups/${enc(group)}/comments?segmen=${enc(segment)}&topik=${enc(topic ?? '')}` +
    `&q=${enc(search ?? '')}&limit=${limit}&offset=${offset}`,
  reportStatus: () => '/api/report/status',
  report: () => '/api/report',
};
