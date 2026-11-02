'use strict';

const router = require('express').Router();
const { asyncHandler: h } = require('../utils/http');
const { validate } = require('../middleware/validate');
const { limiters } = require('../middleware/security');
const c = require('../controllers/catalog.controller');
const { z, slug, pincode, pagination, listProductsQuery } = require('../validators/schemas');

const slugParams = z.object({ slug });

router.get('/products', validate({ query: listProductsQuery }), h(c.listProducts));
router.get('/products/facets', validate({ query: listProductsQuery }), h(c.facets));
router.get('/products/:slug', validate({ params: slugParams }), h(c.product));
router.get('/products/:slug/related', validate({ params: slugParams }), h(c.related));
router.get(
  '/products/:slug/reviews',
  validate({ params: slugParams, query: z.object({ ...pagination, limit: z.coerce.number().int().min(1).max(50).default(10), sort: z.enum(['newest', 'highest', 'lowest']).default('newest') }) }),
  h(c.productReviews)
);
router.get('/products/:slug/review-eligibility', validate({ params: slugParams }), h(c.reviewEligibility));
router.get('/products/:slug/offers', validate({ params: slugParams }), h(c.offers));
router.get('/offers', h(c.allOffers));
router.get('/products/:slug/delivery', limiters.search, validate({ params: slugParams, query: z.object({ pincode }) }), h(c.delivery));

router.get('/categories', h(c.categories));
router.get('/categories/:slug', validate({ params: slugParams }), h(c.category));
router.get('/collections', h(c.collections));
router.get('/collections/:slug', validate({ params: slugParams }), h(c.collection));

router.get('/search/suggest', limiters.search, validate({ query: z.object({ q: z.string().trim().max(80).default('') }) }), h(c.suggest));
router.get('/search', limiters.search, validate({ query: listProductsQuery }), h(c.search));

module.exports = router;
