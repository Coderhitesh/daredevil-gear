/** Only allow same-site relative redirects after sign-in. */
export function safeNext(value, fallback = '/') {
  if (!value || typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (value.startsWith('/login') || value.startsWith('/mfa')) return fallback;
  return value;
}
