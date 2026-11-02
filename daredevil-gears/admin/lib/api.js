'use client';

/**
 * Admin API client. Same-origin /api/v1/admin, session cookie, CSRF header on writes.
 * 401 → login, 403 MFA_SETUP_REQUIRED → MFA enrolment.
 */
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || (status >= 500 ? 'The server could not complete this request. Try again.' : 'Request failed'));
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details || [];
  }
}

function bounce(path) {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith(path)) return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`${path}?next=${next}`);
}

export async function api(path, { method = 'GET', body, query, raw = false } = {}) {
  const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''))}` : '';
  const init = { method, credentials: 'include', headers: { Accept: 'application/json' } };
  if (method !== 'GET') init.headers['x-ddg-csrf'] = '1';
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`/api/v1/admin${path}${qs === '?' ? '' : qs}`, init);
  if (raw) return res;
  const json = await res.json().catch(() => null);
  if (res.status === 401 && !path.startsWith('/auth/login')) bounce('/login');
  if (res.status === 403 && json?.error?.code === 'MFA_SETUP_REQUIRED') bounce('/mfa');
  if (!res.ok || !json?.success) throw new ApiError(res.status, json);
  return json.meta ? { data: json.data, meta: json.meta } : json.data;
}

/** Download a file (CSV/JSON) from an authenticated GET endpoint. */
export async function download(path, fallbackName) {
  const res = await api(path, { raw: true });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new ApiError(res.status, json);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Map API validation details to { 'a.b': message }. */
export function fieldErrors(err) {
  const out = {};
  for (const d of err?.details || []) {
    const key = String(d.field || '').replace(/^(body|query|params)\./, '');
    if (key && !out[key]) out[key] = d.message;
  }
  return out;
}

/** Apply API field errors to a react-hook-form instance. Returns true if any were applied. */
export function applyFieldErrors(err, setError, prefix = '') {
  const map = fieldErrors(err);
  let applied = false;
  for (const [k, message] of Object.entries(map)) {
    const name = prefix && k.startsWith(prefix) ? k.slice(prefix.length) : k;
    setError(name, { type: 'server', message });
    applied = true;
  }
  return applied;
}
