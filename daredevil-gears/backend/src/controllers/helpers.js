'use strict';

const env = require('../config/env');
const { COOKIES, cookieBase } = require('../middleware/auth');

function ctx(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] || '' };
}

function setCustomerCookies(res, { accessToken, refreshToken }) {
  res.cookie(COOKIES.access, accessToken, { ...cookieBase(), path: '/', maxAge: env.ACCESS_TOKEN_TTL_MIN * 60_000 });
  res.cookie(COOKIES.refresh, refreshToken, { ...cookieBase(), path: '/api/v1/auth', maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86400_000 });
}

function clearCustomerCookies(res) {
  res.clearCookie(COOKIES.access, { ...cookieBase(), path: '/' });
  res.clearCookie(COOKIES.refresh, { ...cookieBase(), path: '/api/v1/auth' });
}

function setGuestCartCookie(res, token) {
  res.cookie(COOKIES.guestCart, token, { ...cookieBase(), path: '/', maxAge: 30 * 86400_000 });
}

function clearGuestCartCookie(res) {
  res.clearCookie(COOKIES.guestCart, { ...cookieBase(), path: '/' });
}

function guestToken(req) {
  const t = req.cookies?.[COOKIES.guestCart];
  return typeof t === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(t) ? t : null;
}

function noStore(res) {
  res.set('Cache-Control', 'private, no-store');
}

function publicCache(res, seconds = 60) {
  res.set('Cache-Control', `public, max-age=${Math.min(seconds, 60)}, s-maxage=${seconds}, stale-while-revalidate=${seconds * 5}`);
}

module.exports = { ctx, setCustomerCookies, clearCustomerCookies, setGuestCartCookie, clearGuestCartCookie, guestToken, noStore, publicCache };
