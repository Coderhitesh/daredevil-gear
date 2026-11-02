'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { ApiError } = require('../utils/http');
const { sha256 } = require('../utils/crypto');
const { User, Session } = require('../models');
const { ADMIN_ROLES, can } = require('../shared');

const COOKIES = Object.freeze({
  access: 'ddg_at',
  refresh: 'ddg_rt',
  admin: 'ddg_admin',
  guestCart: 'ddg_cart',
});

function cookieBase() {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    domain: env.COOKIE_DOMAIN || undefined,
  };
}

function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role, tv: user.tokenVersion || 0 }, env.JWT_ACCESS_SECRET, {
    expiresIn: `${env.ACCESS_TOKEN_TTL_MIN}m`,
    issuer: 'ddg-api',
    audience: 'ddg-store',
  });
}

function readAccessToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[COOKIES.access];
}

/** Attaches req.user when a valid customer access token is present. Never throws. */
async function optionalCustomer(req, _res, next) {
  try {
    const token = readAccessToken(req);
    if (!token) return next();
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'ddg-api', audience: 'ddg-store' });
    const user = await User.findById(payload.sub).select('+tokenVersion');
    if (!user || user.status !== 'active' || (user.tokenVersion || 0) !== payload.tv) return next();
    req.user = user;
  } catch {
    // expired/invalid token: treat as anonymous; client will refresh
  }
  return next();
}

function requireCustomer(req, _res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  if (ADMIN_ROLES.includes(req.user.role)) return next(ApiError.forbidden('Use a customer account for the storefront'));
  return next();
}

function requireVerifiedCustomer(req, res, next) {
  return requireCustomer(req, res, (err) => {
    if (err) return next(err);
    if (!req.user.emailVerified) return next(ApiError.forbidden('Please verify your email address first', { code: 'EMAIL_NOT_VERIFIED' }));
    return next();
  });
}

/** Admin auth: opaque session token stored hashed; revocable and checked on every request. */
async function requireAdmin(req, _res, next) {
  try {
    const raw = req.cookies?.[COOKIES.admin];
    if (!raw) throw ApiError.unauthorized('Admin session required');
    const session = await Session.findOne({ tokenHash: sha256(raw), kind: 'admin', revokedAt: null });
    if (!session || session.expiresAt < new Date()) throw ApiError.unauthorized('Admin session expired');
    const user = await User.findById(session.user);
    if (!user || user.status !== 'active' || !ADMIN_ROLES.includes(user.role)) throw ApiError.unauthorized('Admin session invalid');
    session.lastUsedAt = new Date();
    await session.save();
    req.admin = user;
    req.adminSession = session;
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Server-side permission enforcement. */
function requirePermission(...permissions) {
  return (req, _res, next) => {
    const role = req.admin?.role;
    if (!role) return next(ApiError.unauthorized());
    const allowed = permissions.every((p) => can(role, p));
    if (!allowed) return next(ApiError.forbidden());
    return next();
  };
}

function requireAnyPermission(...permissions) {
  return (req, _res, next) => {
    const role = req.admin?.role;
    if (!role) return next(ApiError.unauthorized());
    return permissions.some((p) => can(role, p)) ? next() : next(ApiError.forbidden());
  };
}

module.exports = {
  requireAnyPermission,
  COOKIES,
  cookieBase,
  signAccessToken,
  optionalCustomer,
  requireCustomer,
  requireVerifiedCustomer,
  requireAdmin,
  requirePermission,
};
