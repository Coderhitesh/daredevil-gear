'use strict';

const { ok, pageMeta, ApiError } = require('../utils/http');
const catalog = require('../services/catalog.service');
const search = require('../services/search.service');
const reviews = require('../services/review.service');
const shipping = require('../services/shipping.service');
const { Product } = require('../models');
const { publicCache, noStore } = require('./helpers');

module.exports = {
  listProducts: async (req, res) => {
    const q = req.validQuery;
    const { items, total } = await catalog.listProducts(q);
    publicCache(res, 60);
    return ok(res, items, pageMeta(q, total));
  },

  facets: async (req, res) => {
    publicCache(res, 120);
    return ok(res, await catalog.facets(req.validQuery));
  },

  product: async (req, res) => {
    publicCache(res, 60);
    return ok(res, await catalog.productBySlug(req.params.slug));
  },

  related: async (req, res) => {
    publicCache(res, 300);
    return ok(res, await catalog.relatedProducts(req.params.slug));
  },

  productReviews: async (req, res) => {
    const p = await Product.findOne({ slug: req.params.slug, status: 'published' }).select('_id').lean();
    if (!p) throw ApiError.notFound('Product not found');
    const q = req.validQuery;
    const data = await reviews.listForProduct(p._id, q);
    publicCache(res, 60);
    return ok(res, data, pageMeta(q, data.total));
  },

  reviewEligibility: async (req, res) => {
    const p = await Product.findOne({ slug: req.params.slug, status: 'published' }).select('_id').lean();
    if (!p) throw ApiError.notFound('Product not found');
    noStore(res);
    return ok(res, await reviews.eligibility(req.user, p._id));
  },

  offers: async (req, res) => {
    const p = await Product.findOne({ slug: req.params.slug, status: 'published' }).lean();
    if (!p) throw ApiError.notFound('Product not found');
    const offerService = require('../services/offer.service');
    const views = (await Promise.all((await offerService.forProduct(p)).map((o) => offerService.publicView(o)))).filter(Boolean);
    return ok(res, views);
  },

  allOffers: async (_req, res) => {
    const offerService = require('../services/offer.service');
    const views = (await Promise.all((await offerService.active()).map((o) => offerService.publicView(o)))).filter(Boolean);
    return ok(res, views);
  },

  delivery: async (req, res) => {
    const p = await Product.findOne({ slug: req.params.slug, status: 'published' }).lean();
    if (!p) throw ApiError.notFound('Product not found');
    return ok(res, await shipping.checkPincode({ product: p, pincode: req.validQuery.pincode }));
  },

  categories: async (_req, res) => {
    publicCache(res, 300);
    return ok(res, await catalog.categoryTree());
  },

  category: async (req, res) => {
    const { category, children, ancestors } = await catalog.categoryBySlug(req.params.slug);
    publicCache(res, 300);
    return ok(res, { ...catalog.serialiseCategory(category), children: children.filter((c) => c.productCount > 0).map(catalog.serialiseCategory), ancestors: ancestors.map(catalog.serialiseCategory) });
  },

  collections: async (_req, res) => {
    publicCache(res, 300);
    return ok(res, await catalog.listCollections());
  },

  collection: async (req, res) => {
    publicCache(res, 300);
    return ok(res, await catalog.collectionBySlug(req.params.slug));
  },

  suggest: async (req, res) => {
    publicCache(res, 30);
    return ok(res, await search.suggest(req.validQuery.q));
  },

  search: async (req, res) => {
    const q = req.validQuery;
    const result = await search.search(q, { userId: req.user?._id });
    noStore(res);
    return ok(res, result.items, { ...pageMeta(q, result.total), correctedQuery: result.correctedQuery, query: q.q });
  },
};
