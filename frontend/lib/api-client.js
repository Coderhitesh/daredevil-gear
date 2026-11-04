'use client';

/**
 * Browser API client. Same-origin `/api` (proxied), cookies included, CSRF header on unsafe methods,
 * one silent refresh-token retry on 401.
 */
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Something went wrong. Please try again.');
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details || [];
  }
}

let refreshing = null;

export async function refreshSession() {
  if (!refreshing) {
    refreshing = fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'x-ddg-csrf': '1' } })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => setTimeout(() => (refreshing = null), 0));
  }
  return refreshing;
}

export async function api(path, { method = 'GET', body, headers = {}, retry = true, raw = false } = {}) {
  const init = {
    method,
    credentials: 'include',
    headers: { Accept: 'application/json', ...(method !== 'GET' ? { 'x-ddg-csrf': '1' } : {}), ...headers },
  };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`/api/v1${path}`, init);
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return api(path, { method, body, headers, retry: false, raw });
  }
  if (raw) return res;
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new ApiError(res.status, json);
  return json.meta ? { data: json.data, meta: json.meta } : json.data;
}

/** Map API validation details to { fieldName: message } for react-hook-form. */
export function fieldErrors(err) {
  const out = {};
  for (const d of err?.details || []) {
    const key = String(d.field || '').replace(/^(body|query|params)\./, '');
    if (key && !out[key]) out[key] = d.message;
  }
  return out;
}
