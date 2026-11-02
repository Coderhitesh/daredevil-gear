'use strict';

const router = require('express').Router();
const env = require('../../config/env');
const { asyncHandler: h, ok, ApiError } = require('../../utils/http');
const { validate } = require('../../middleware/validate');
const { limiters } = require('../../middleware/security');
const { COOKIES, cookieBase, requireAdmin } = require('../../middleware/auth');
const auth = require('../../services/auth.service');
const { audit } = require('../../services/audit.service');
const { hashPassword, verifyPassword, passwordProblem } = require('../../services/password.service');
const { User, Session } = require('../../models');
const { PERMISSIONS } = require('../../shared');
const { z, email } = require('../../validators/schemas');

function adminView(user, session) {
  return {
    ...user.toSafeJSON(),
    permissions: Object.keys(PERMISSIONS).filter((p) => PERMISSIONS[p].includes(user.role)),
    mfaSetupRequired: env.ADMIN_MFA_REQUIRED && !session?.mfaSatisfied,
  };
}

router.post(
  '/login',
  limiters.adminLogin,
  validate({ body: z.object({ email, password: z.string().min(1).max(128), totp: z.string().regex(/^\d{6}$/).optional() }) }),
  h(async (req, res) => {
    try {
      const { user, token, mfaSetupRequired } = await auth.adminLogin(req.body, { ip: req.ip, userAgent: req.headers['user-agent'] });
      res.cookie(COOKIES.admin, token, { ...cookieBase(), path: '/', maxAge: env.ADMIN_SESSION_TTL_HOURS * 3600_000, sameSite: 'strict' });
      await audit({ admin: user, ip: req.ip, headers: req.headers }, { action: 'admin.login', entity: 'User', entityId: user._id, summary: mfaSetupRequired ? 'Login (MFA enrolment pending)' : 'Login' });
      res.set('Cache-Control', 'no-store');
      return ok(res, { user: adminView(user, { mfaSatisfied: !mfaSetupRequired }) });
    } catch (err) {
      if (err.status === 401 || err.status === 429) await audit({ ip: req.ip, headers: req.headers }, { action: 'admin.login_failed', entity: 'User', summary: `${req.body.email}: ${err.code}` });
      throw err;
    }
  })
);

router.post(
  '/logout',
  requireAdmin,
  h(async (req, res) => {
    await auth.adminLogout(req.adminSession);
    res.clearCookie(COOKIES.admin, { ...cookieBase(), path: '/', sameSite: 'strict' });
    await audit(req, { action: 'admin.logout', entity: 'User', entityId: req.admin._id });
    return ok(res, { loggedOut: true });
  })
);

router.get(
  '/me',
  requireAdmin,
  h(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    return ok(res, { user: adminView(req.admin, req.adminSession) });
  })
);

router.post(
  '/mfa/setup',
  requireAdmin,
  h(async (req, res) => {
    if (req.admin.mfa?.enabled) throw ApiError.conflict('Authenticator is already set up. Ask a super admin to reset it if you lost your device.');
    return ok(res, await auth.startMfaEnrollment(req.admin));
  })
);

router.post(
  '/mfa/confirm',
  requireAdmin,
  validate({ body: z.object({ code: z.string().regex(/^\d{6}$/) }) }),
  h(async (req, res) => {
    await auth.confirmMfaEnrollment(req.admin, req.adminSession, req.body.code);
    await audit(req, { action: 'admin.mfa_enrolled', entity: 'User', entityId: req.admin._id });
    const fresh = await User.findById(req.admin._id);
    return ok(res, { user: adminView(fresh, req.adminSession) });
  })
);

router.post(
  '/password',
  requireAdmin,
  limiters.adminLogin,
  validate({ body: z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12, 'Admin passwords need at least 12 characters').max(128) }) }),
  h(async (req, res) => {
    const user = await User.findById(req.admin._id).select('+passwordHash');
    if (!(await verifyPassword(user.passwordHash, req.body.currentPassword))) throw ApiError.badRequest('Current password is incorrect');
    const problem = passwordProblem(req.body.newPassword, { email: user.email, name: user.name });
    if (problem) throw ApiError.unprocessable(problem);
    user.passwordHash = await hashPassword(req.body.newPassword);
    await user.save();
    await Session.updateMany({ user: user._id, kind: 'admin', _id: { $ne: req.adminSession._id }, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'password_changed' } });
    await audit(req, { action: 'admin.password_changed', entity: 'User', entityId: user._id });
    return ok(res, { changed: true });
  })
);

module.exports = router;
