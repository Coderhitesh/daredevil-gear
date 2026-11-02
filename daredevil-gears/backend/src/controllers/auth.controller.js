'use strict';

const { ok, ApiError } = require('../utils/http');
const auth = require('../services/auth.service');
const cartService = require('../services/cart.service');
const { COOKIES } = require('../middleware/auth');
const { ctx, setCustomerCookies, clearCustomerCookies, clearGuestCartCookie, guestToken, noStore } = require('./helpers');

async function afterLogin(req, res, result) {
  setCustomerCookies(res, result);
  const gt = guestToken(req);
  if (gt) {
    await cartService.mergeGuestCart(result.user, gt);
    clearGuestCartCookie(res);
  }
  noStore(res);
  return ok(res, { user: result.user.toSafeJSON() });
}

module.exports = {
  register: async (req, res) => ok(res, await auth.register(req.body, ctx(req)), undefined, 202),

  resendOtp: async (req, res) => ok(res, await auth.resendVerification(req.body.email, ctx(req))),

  verifyEmail: async (req, res) => afterLogin(req, res, await auth.verifyEmail(req.body, ctx(req))),

  login: async (req, res) => afterLogin(req, res, await auth.login(req.body, ctx(req))),

  refresh: async (req, res) => {
    try {
      const result = await auth.refresh(req.cookies?.[COOKIES.refresh], ctx(req));
      setCustomerCookies(res, result);
      noStore(res);
      return ok(res, { user: result.user.toSafeJSON() });
    } catch (err) {
      clearCustomerCookies(res);
      throw err;
    }
  },

  logout: async (req, res) => {
    await auth.logout(req.cookies?.[COOKIES.refresh]);
    clearCustomerCookies(res);
    return ok(res, { loggedOut: true });
  },

  logoutAll: async (req, res) => {
    if (!req.user) throw ApiError.unauthorized();
    await auth.logoutAll(req.user._id);
    clearCustomerCookies(res);
    return ok(res, { loggedOut: true });
  },

  forgotPassword: async (req, res) => ok(res, await auth.forgotPassword(req.body.email, ctx(req))),

  resetPassword: async (req, res) => ok(res, await auth.resetPassword(req.body)),

  me: async (req, res) => {
    noStore(res);
    return ok(res, { user: req.user ? req.user.toSafeJSON() : null });
  },
};
