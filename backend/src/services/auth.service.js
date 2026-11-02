'use strict';

const env = require('../config/env');
const logger = require('../config/logger');
const { ApiError } = require('../utils/http');
const { randomToken, sha256, verifyTotp, generateTotpSecret, totpUri } = require('../utils/crypto');
const { User, Session, EmailVerification, PasswordReset } = require('../models');
const { hashPassword, verifyPassword, passwordProblem } = require('./password.service');
const otp = require('./otp.service');
const email = require('./email.service');
const { signAccessToken } = require('../middleware/auth');
const { ADMIN_ROLES, ROLES } = require('../shared');

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const GENERIC_SENT = 'If the details are valid, a 6-digit code has been sent to the email address.';

// ---------------- Customer registration & verification ----------------

async function register({ name, email: rawEmail, password, phone, marketingConsent }, ctx) {
  const emailAddr = rawEmail.toLowerCase().trim();
  const problem = passwordProblem(password, { email: emailAddr, name });
  if (problem) throw ApiError.unprocessable(problem, { details: [{ field: 'body.password', message: problem }] });

  const existing = await User.findOne({ email: emailAddr });
  if (existing && (existing.emailVerified || ADMIN_ROLES.includes(existing.role))) {
    // Do not reveal the account exists. Same response, no code.
    logger.info({ emailHash: sha256(emailAddr).slice(0, 12) }, 'Registration attempt for existing verified email');
    return { message: GENERIC_SENT };
  }

  const passwordHash = await hashPassword(password);
  const user = existing || new User({ email: emailAddr, role: ROLES.CUSTOMER });
  user.name = name;
  user.phone = phone;
  user.passwordHash = passwordHash;
  user.status = 'pending_verification';
  if (marketingConsent) {
    user.notificationPrefs = { ...(user.notificationPrefs || {}), marketing: true };
    user.marketingConsentAt = new Date();
  }
  await user.save();
  await sendVerification(user, ctx);
  return { message: GENERIC_SENT };
}

/** In development, append the SMTP diagnosis so the cause is visible in the browser too. */
function devHint(err) {
  return env.isProd || !err?.hint ? '' : ` [dev: ${err.hint}]`;
}

async function sendVerification(user, ctx) {
  const { code } = await otp.issue(EmailVerification, { email: user.email, user: user._id, purpose: 'verify_email', ip: ctx?.ip });
  try {
    await email.send('otp_verify', user.email, { code, minutes: env.OTP_TTL_MIN });
  } catch (err) {
    throw ApiError.unavailable(`We could not send the verification email right now. Please try again in a few minutes.${devHint(err)}`, { code: 'EMAIL_SEND_FAILED' });
  }
}

async function resendVerification(emailAddr, ctx) {
  const user = await User.findOne({ email: emailAddr.toLowerCase().trim() });
  if (!user || user.emailVerified || ADMIN_ROLES.includes(user.role)) return { message: GENERIC_SENT };
  await sendVerification(user, ctx);
  return { message: GENERIC_SENT };
}

async function verifyEmail({ email: rawEmail, code }, ctx) {
  const emailAddr = rawEmail.toLowerCase().trim();
  await otp.verify(EmailVerification, { email: emailAddr, purpose: 'verify_email', code });
  const user = await User.findOne({ email: emailAddr }).select('+tokenVersion');
  if (!user) throw ApiError.badRequest('The code is invalid or has expired', { code: 'OTP_INVALID' });
  const wasVerified = user.emailVerified;
  user.emailVerified = true;
  user.emailVerifiedAt = user.emailVerifiedAt || new Date();
  if (user.status === 'pending_verification') user.status = 'active';
  await user.save();
  if (!wasVerified) {
    email.send('welcome', user.email, { name: user.name, storeUrl: env.STOREFRONT_URL }).catch(() => {});
  }
  const tokens = await issueCustomerSession(user, ctx);
  return { user, ...tokens };
}

// ---------------- Login / sessions ----------------

async function login({ email: rawEmail, password }, ctx) {
  const emailAddr = rawEmail.toLowerCase().trim();
  const user = await User.findOne({ email: emailAddr }).select('+passwordHash +failedLoginCount +lockUntil +tokenVersion');
  const invalid = ApiError.unauthorized('Incorrect email or password', { code: 'INVALID_CREDENTIALS' });

  if (!user || ADMIN_ROLES.includes(user.role)) {
    await verifyPassword(null, password); // equalise timing
    throw invalid;
  }
  if (user.lockUntil && user.lockUntil > new Date()) {
    throw ApiError.tooMany('Too many failed attempts. Try again later or reset your password.', { code: 'ACCOUNT_LOCKED' });
  }
  const okPw = await verifyPassword(user.passwordHash, password);
  if (!okPw) {
    user.failedLoginCount = (user.failedLoginCount || 0) + 1;
    if (user.failedLoginCount >= MAX_FAILED_LOGINS) {
      user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      user.failedLoginCount = 0;
    }
    await user.save();
    throw invalid;
  }
  if (user.status === 'suspended' || user.status === 'deleted') throw ApiError.forbidden('This account is not active. Please contact support.', { code: 'ACCOUNT_INACTIVE' });

  user.failedLoginCount = 0;
  user.lockUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  if (!user.emailVerified) {
    await sendVerification(user, ctx).catch((e) => {
      if (e.status !== 429) throw e;
    });
    throw ApiError.forbidden('Please verify your email. We have sent you a new code.', { code: 'EMAIL_NOT_VERIFIED' });
  }
  const tokens = await issueCustomerSession(user, ctx);
  return { user, ...tokens };
}

async function issueCustomerSession(user, ctx, family) {
  const refreshToken = randomToken(48);
  await Session.create({
    user: user._id,
    kind: 'customer',
    tokenHash: sha256(refreshToken),
    family: family || randomToken(12),
    userAgent: ctx?.userAgent?.slice(0, 300),
    ip: ctx?.ip,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400_000),
    lastUsedAt: new Date(),
  });
  return { accessToken: signAccessToken(user), refreshToken };
}

/** Rotating refresh tokens with reuse detection (a reused token revokes the whole family). */
async function refresh(refreshToken, ctx) {
  if (!refreshToken) throw ApiError.unauthorized('Session expired', { code: 'NO_REFRESH' });
  const session = await Session.findOne({ tokenHash: sha256(refreshToken), kind: 'customer' });
  if (!session) throw ApiError.unauthorized('Session expired', { code: 'BAD_REFRESH' });
  if (session.revokedAt) {
    await Session.updateMany({ family: session.family, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'refresh_reuse' } });
    logger.warn({ user: String(session.user) }, 'Refresh token reuse detected; family revoked');
    throw ApiError.unauthorized('Session expired', { code: 'REFRESH_REUSED' });
  }
  if (session.expiresAt < new Date()) throw ApiError.unauthorized('Session expired', { code: 'REFRESH_EXPIRED' });
  const user = await User.findById(session.user).select('+tokenVersion');
  if (!user || user.status !== 'active') throw ApiError.unauthorized('Session expired');

  const rotated = await Session.findOneAndUpdate(
    { _id: session._id, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'rotated' } }
  );
  if (!rotated) throw ApiError.unauthorized('Session expired', { code: 'REFRESH_RACE' });
  const tokens = await issueCustomerSession(user, ctx, session.family);
  return { user, ...tokens };
}

async function logout(refreshToken) {
  if (!refreshToken) return;
  const session = await Session.findOne({ tokenHash: sha256(refreshToken) });
  if (session) await Session.updateMany({ family: session.family, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'logout' } });
}

async function logoutAll(userId) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await Session.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'logout_all' } });
}

async function listSessions(userId, currentRefresh) {
  const currentHash = currentRefresh ? sha256(currentRefresh) : null;
  const sessions = await Session.find({ user: userId, kind: 'customer', revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ lastUsedAt: -1 }).lean();
  return sessions.map((s) => ({ id: String(s._id), userAgent: s.userAgent, ip: s.ip, lastUsedAt: s.lastUsedAt, createdAt: s.createdAt, current: s.tokenHash === currentHash }));
}

async function revokeSession(userId, sessionId) {
  const s = await Session.findOne({ _id: sessionId, user: userId });
  if (!s) throw ApiError.notFound('Session not found');
  await Session.updateMany({ family: s.family, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'user_revoked' } });
}

// ---------------- Password reset ----------------

async function forgotPassword(emailAddr, ctx) {
  const addr = emailAddr.toLowerCase().trim();
  const user = await User.findOne({ email: addr });
  if (user && user.emailVerified && user.status === 'active' && !ADMIN_ROLES.includes(user.role)) {
    const { code } = await otp.issue(PasswordReset, { email: addr, user: user._id, ip: ctx?.ip });
    try {
      await email.send('password_reset', addr, { code, minutes: env.OTP_TTL_MIN });
    } catch (err) {
      throw ApiError.unavailable(`We could not send the reset email right now. Please try again shortly.${devHint(err)}`, { code: 'EMAIL_SEND_FAILED' });
    }
  }
  return { message: GENERIC_SENT };
}

async function resetPassword({ email: rawEmail, code, password }) {
  const addr = rawEmail.toLowerCase().trim();
  const user = await User.findOne({ email: addr });
  const problem = passwordProblem(password, { email: addr, name: user?.name });
  if (problem) throw ApiError.unprocessable(problem, { details: [{ field: 'body.password', message: problem }] });
  await otp.verify(PasswordReset, { email: addr, code });
  if (!user) throw ApiError.badRequest('The code is invalid or has expired', { code: 'OTP_INVALID' });
  user.passwordHash = await hashPassword(password);
  await user.save();
  await logoutAll(user._id);
  return { message: 'Your password has been reset. Please sign in.' };
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!(await verifyPassword(user.passwordHash, currentPassword))) throw ApiError.badRequest('Current password is incorrect', { code: 'BAD_PASSWORD' });
  const problem = passwordProblem(newPassword, { email: user.email, name: user.name });
  if (problem) throw ApiError.unprocessable(problem);
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await logoutAll(user._id);
}

// ---------------- Admin authentication ----------------

async function adminLogin({ email: rawEmail, password, totp }, ctx) {
  const addr = rawEmail.toLowerCase().trim();
  const user = await User.findOne({ email: addr }).select('+passwordHash +failedLoginCount +lockUntil +mfa.secret');
  const invalid = ApiError.unauthorized('Invalid credentials', { code: 'INVALID_CREDENTIALS' });
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    await verifyPassword(null, password);
    throw invalid;
  }
  if (user.lockUntil && user.lockUntil > new Date()) throw ApiError.tooMany('Account temporarily locked. Try again later.', { code: 'ACCOUNT_LOCKED' });
  const okPw = await verifyPassword(user.passwordHash, password);
  if (!okPw) {
    user.failedLoginCount = (user.failedLoginCount || 0) + 1;
    if (user.failedLoginCount >= MAX_FAILED_LOGINS) {
      user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      user.failedLoginCount = 0;
    }
    await user.save();
    throw invalid;
  }
  if (user.status !== 'active') throw ApiError.forbidden('Account is not active');

  let mfaSatisfied = false;
  if (user.mfa?.enabled) {
    if (!totp) throw ApiError.unauthorized('Enter the 6-digit code from your authenticator app', { code: 'MFA_REQUIRED' });
    if (!verifyTotp(user.mfa.secret, totp)) {
      user.failedLoginCount = (user.failedLoginCount || 0) + 1;
      await user.save();
      throw ApiError.unauthorized('Invalid authenticator code', { code: 'MFA_INVALID' });
    }
    mfaSatisfied = true;
  } else if (!env.ADMIN_MFA_REQUIRED) {
    mfaSatisfied = true;
  }

  user.failedLoginCount = 0;
  user.lockUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  const token = randomToken(48);
  await Session.create({
    user: user._id,
    kind: 'admin',
    tokenHash: sha256(token),
    family: randomToken(12),
    userAgent: ctx?.userAgent?.slice(0, 300),
    ip: ctx?.ip,
    expiresAt: new Date(Date.now() + env.ADMIN_SESSION_TTL_HOURS * 3600_000),
    lastUsedAt: new Date(),
    mfaSatisfied,
  });
  return { user, token, mfaSetupRequired: !mfaSatisfied };
}

async function adminLogout(session) {
  if (session) {
    session.revokedAt = new Date();
    session.revokedReason = 'logout';
    await session.save();
  }
}

async function startMfaEnrollment(user) {
  const secret = generateTotpSecret();
  await User.updateOne({ _id: user._id }, { $set: { 'mfa.pendingSecret': secret } });
  return { secret, otpauthUrl: totpUri({ secret, account: user.email }) };
}

async function confirmMfaEnrollment(user, session, code) {
  const fresh = await User.findById(user._id).select('+mfa.pendingSecret');
  const secret = fresh?.mfa?.pendingSecret;
  if (!secret || !verifyTotp(secret, code)) throw ApiError.badRequest('That code did not match. Check your device time and try again.', { code: 'MFA_INVALID' });
  await User.updateOne({ _id: user._id }, { $set: { 'mfa.enabled': true, 'mfa.secret': secret, 'mfa.enrolledAt': new Date() }, $unset: { 'mfa.pendingSecret': 1 } });
  session.mfaSatisfied = true;
  await session.save();
}

module.exports = {
  register,
  resendVerification,
  verifyEmail,
  login,
  refresh,
  logout,
  logoutAll,
  listSessions,
  revokeSession,
  forgotPassword,
  resetPassword,
  changePassword,
  adminLogin,
  adminLogout,
  startMfaEnrollment,
  confirmMfaEnrollment,
  issueCustomerSession,
};
