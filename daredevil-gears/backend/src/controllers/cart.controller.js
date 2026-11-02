'use strict';

const { ok } = require('../utils/http');
const cartService = require('../services/cart.service');
const catalog = require('../services/catalog.service');
const { Wishlist, Product } = require('../models');
const { guestToken, setGuestCartCookie, noStore } = require('./helpers');

function cartCtx(req) {
  return { user: req.user || null, guestToken: guestToken(req) };
}

async function respondWithView(req, res, cart, extra = {}) {
  noStore(res);
  const destination = req.validQuery?.pincode ? { pincode: req.validQuery.pincode, state: req.validQuery.state, country: 'IN' } : null;
  const view = await cartService.buildView(cart, { user: req.user, email: req.validQuery?.email, destination });
  return ok(res, { ...view, ...extra });
}

module.exports = {
  get: async (req, res) => respondWithView(req, res, await cartService.findCart(cartCtx(req))),

  add: async (req, res) => {
    const { cart, newGuestToken, adjusted } = await cartService.addItem(cartCtx(req), req.body);
    if (newGuestToken) setGuestCartCookie(res, newGuestToken);
    return respondWithView(req, res, cart, adjusted ? { adjustedQuantity: adjusted } : {});
  },

  update: async (req, res) => respondWithView(req, res, await cartService.updateItem(cartCtx(req), req.params.itemId, req.body.quantity)),

  remove: async (req, res) => respondWithView(req, res, await cartService.removeItem(cartCtx(req), req.params.itemId)),

  applyCoupon: async (req, res) => respondWithView(req, res, await cartService.applyCoupon(cartCtx(req), req.body.code, { email: req.body.email })),

  removeCoupon: async (req, res) => respondWithView(req, res, await cartService.removeCoupon(cartCtx(req))),

  // ---- wishlist (signed-in customers; guests keep a local list that is merged on sign-in)
  wishlist: async (req, res) => {
    noStore(res);
    const w = await Wishlist.findOne({ user: req.user._id }).lean();
    return ok(res, w ? await catalog.productsByIds(w.products.map(String)) : []);
  },

  wishlistAdd: async (req, res) => {
    const exists = await Product.exists({ _id: req.body.productId, status: 'published' });
    if (exists) await Wishlist.updateOne({ user: req.user._id }, { $addToSet: { products: req.body.productId } }, { upsert: true });
    const w = await Wishlist.findOne({ user: req.user._id }).lean();
    return ok(res, { productIds: (w?.products || []).map(String) });
  },

  wishlistRemove: async (req, res) => {
    await Wishlist.updateOne({ user: req.user._id }, { $pull: { products: req.params.productId } });
    const w = await Wishlist.findOne({ user: req.user._id }).lean();
    return ok(res, { productIds: (w?.products || []).map(String) });
  },

  wishlistMerge: async (req, res) => {
    const valid = await Product.find({ _id: { $in: req.body.productIds }, status: 'published' }).select('_id').lean();
    if (valid.length) await Wishlist.updateOne({ user: req.user._id }, { $addToSet: { products: { $each: valid.map((v) => v._id) } } }, { upsert: true });
    const w = await Wishlist.findOne({ user: req.user._id }).lean();
    return ok(res, { productIds: (w?.products || []).map(String) });
  },
};
