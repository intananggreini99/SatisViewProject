// Pembungkus fetch: timeout, JSON, token login, dan pesan error yang ramah pengguna.
export class ApiError extends Error {
  constructor(message, status, body = null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Token JWT pengelola & penangan sesi berakhir diisi oleh AuthProvider.
const auth = { token: null, onUnauthorized: null };
export function setAuthToken(token) {
  auth.token = token;
}
export function setUnauthorizedHandler(handler) {
  auth.onUnauthorized = handler;
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

async function request(url, { method = 'GET', body, signal, timeoutMs = 20_000, withAuth = true, raw = false } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? anySignal([signal, timeout]) : timeout;
  const headers = { Accept: raw ? '*/*' : 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (withAuth && auth.token) headers.Authorization = `Bearer ${auth.token}`;
  let response;
  try {
    response = await fetch(url, {
      method,
      signal: combined,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) throw new ApiError('Server terlalu lama merespons. Coba lagi.', 0);
    throw new ApiError('Tidak dapat terhubung ke server SatisView. Periksa koneksi internet Anda.', 0);
  }
  if (raw && response.ok) return response;
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    if (response.status === 401 && withAuth && auth.token) auth.onUnauthorized?.(data?.error);
    throw new ApiError(data?.error ?? `Permintaan gagal (HTTP ${response.status}).`, response.status, data);
  }
  return data;
}

export const fetchJson = (url, options = {}) => request(url, options);
export const postJson = (url, body, options = {}) => request(url, { ...options, method: 'POST', body });

/** Unduh file terlindungi (mis. laporan PDF) memakai token lalu simpan lewat <a download>. */
export async function downloadFile(url, filename) {
  const response = await request(url, { raw: true, timeoutMs: 120_000 });
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
  return blob.size;
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
  login: () => '/api/auth/masuk',
  me: () => '/api/auth/saya',
  logout: () => '/api/auth/keluar',
  kuesioner: (group) => `/api/kuesioner/${enc(group)}`,
};
