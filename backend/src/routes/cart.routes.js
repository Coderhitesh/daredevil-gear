'use strict';

const router = require('express').Router();
const { asyncHandler: h } = require('../utils/http');
const { validate } = require('../middleware/validate');
const { requireCustomer } = require('../middleware/auth');
const c = require('../controllers/cart.controller');
const { z, objectId, pincode, email } = require('../validators/schemas');

const viewQuery = z.object({ pincode: pincode.optional(), state: z.string().max(80).optional(), email: email.optional() });

router.get('/cart', validate({ query: viewQuery }), h(c.get));
router.post(
  '/cart/items',
  validate({ query: viewQuery, body: z.object({ productId: objectId, variantId: objectId.optional(), quantity: z.coerce.number().int().min(1).max(10).default(1) }) }),
  h(c.add)
);
router.post('/cart/offers/:offerId', validate({ query: viewQuery, params: z.object({ offerId: objectId }) }), h(c.addOffer));
router.patch('/cart/items/:itemId', validate({ query: viewQuery, params: z.object({ itemId: objectId }), body: z.object({ quantity: z.coerce.number().int().min(0).max(10) }) }), h(c.update));
router.delete('/cart/items/:itemId', validate({ query: viewQuery, params: z.object({ itemId: objectId }) }), h(c.remove));
router.post('/cart/coupon', validate({ query: viewQuery, body: z.object({ code: z.string().trim().min(2).max(30), email: email.optional() }) }), h(c.applyCoupon));
router.delete('/cart/coupon', validate({ query: viewQuery }), h(c.removeCoupon));

router.get('/wishlist', requireCustomer, h(c.wishlist));
router.post('/wishlist', requireCustomer, validate({ body: z.object({ productId: objectId }) }), h(c.wishlistAdd));
router.post('/wishlist/merge', requireCustomer, validate({ body: z.object({ productIds: z.array(objectId).max(100) }) }), h(c.wishlistMerge));
router.delete('/wishlist/:productId', requireCustomer, validate({ params: z.object({ productId: objectId }) }), h(c.wishlistRemove));

module.exports = router;
