'use strict';

const { Review, Order, Product } = require('../models');
const { ApiError } = require('../utils/http');
const settings = require('./settings.service');

async function purchaseFor(user, productId) {
  return Order.findOne({ user: user._id, 'items.product': productId, status: { $in: ['delivered', 'return_requested', 'returned', 'partially_refunded'] } }).select('_id').lean();
}

async function eligibility(user, productId) {
  if (!user) return { canReview: false, reason: 'sign_in' };
  const existing = await Review.findOne({ product: productId, user: user._id }).lean();
  if (existing) return { canReview: false, reason: 'already_reviewed', status: existing.status };
  const cfg = await settings.get('reviews');
  if (!cfg.enabled) return { canReview: false, reason: 'disabled' };
  const order = await purchaseFor(user, productId);
  if (cfg.requireVerifiedPurchase && !order) return { canReview: false, reason: 'purchase_required' };
  return { canReview: true, verifiedPurchase: Boolean(order) };
}

async function create(user, productId, { rating, title, body }) {
  const product = await Product.findOne({ _id: productId, status: 'published' }).select('_id').lean();
  if (!product) throw ApiError.notFound('Product not found');
  const elig = await eligibility(user, productId);
  if (!elig.canReview) {
    const msg = { already_reviewed: 'You have already reviewed this product', purchase_required: 'Only customers who received this product can review it', disabled: 'Reviews are currently disabled' }[elig.reason];
    throw ApiError.forbidden(msg || 'You cannot review this product', { code: 'REVIEW_NOT_ALLOWED' });
  }
  const cfg = await settings.get('reviews');
  const order = await purchaseFor(user, productId);
  const review = await Review.create({
    product: productId,
    user: user._id,
    order: order?._id,
    authorName: shortName(user.name),
    rating,
    title,
    body,
    isVerifiedPurchase: Boolean(order),
    status: cfg.autoApprove && order ? 'approved' : 'pending',
  });
  if (review.status === 'approved') await recalc(productId);
  return review;
}

function shortName(name) {
  const parts = String(name || 'Customer').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

async function recalc(productId) {
  const reviews = await Review.find({ product: productId, status: 'approved' }).select('rating').lean();
  const count = reviews.length;
  const average = count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;
  await Product.updateOne({ _id: productId }, { $set: { 'ratings.average': Math.round(average * 100) / 100, 'ratings.count': count } });
}

async function listForProduct(productId, { page = 1, limit = 10, sort = 'newest' }) {
  const filter = { product: productId, status: 'approved' };
  const order = sort === 'highest' ? { rating: -1, createdAt: -1 } : sort === 'lowest' ? { rating: 1, createdAt: -1 } : { createdAt: -1 };
  const [items, total, all] = await Promise.all([
    Review.find(filter).sort(order).skip((page - 1) * limit).limit(limit).lean(),
    Review.countDocuments(filter),
    Review.find(filter).select('rating').lean(),
  ]);
  const distribution = [5, 4, 3, 2, 1].map((star) => ({ star, count: all.filter((r) => r.rating === star).length }));
  return {
    items: items.map((r) => ({ id: String(r._id), rating: r.rating, title: r.title, body: r.body, author: r.authorName, verifiedPurchase: r.isVerifiedPurchase, createdAt: r.createdAt })),
    total,
    summary: { average: all.length ? Math.round((all.reduce((s, r) => s + r.rating, 0) / all.length) * 10) / 10 : 0, count: all.length, distribution },
  };
}

async function report(reviewId, user, reason) {
  const r = await Review.findOne({ _id: reviewId, status: 'approved' });
  if (!r) throw ApiError.notFound('Review not found');
  if (r.reports.some((x) => String(x.user) === String(user._id))) return r;
  r.reports.push({ user: user._id, reason });
  r.reportCount = r.reports.length;
  await r.save();
  return r;
}

async function moderate(id, { status, rejectionReason }, actor) {
  const r = await Review.findById(id);
  if (!r) throw ApiError.notFound('Review not found');
  r.status = status;
  r.rejectionReason = status === 'rejected' ? rejectionReason : undefined;
  r.moderatedBy = actor._id;
  r.moderatedAt = new Date();
  await r.save();
  await recalc(r.product);
  return r;
}

/** Latest approved reviews across the store (homepage). Empty when there are none — never padded. */
async function latestApproved(limit = 6) {
  const items = await Review.find({ status: 'approved', rating: { $gte: 4 } }).sort({ createdAt: -1 }).limit(limit).populate('product', 'name slug status').lean();
  return items
    .filter((r) => r.product?.status === 'published')
    .map((r) => ({ id: String(r._id), rating: r.rating, title: r.title, body: r.body, author: r.authorName, verifiedPurchase: r.isVerifiedPurchase, product: { name: r.product.name, slug: r.product.slug }, createdAt: r.createdAt }));
}

module.exports = { eligibility, create, recalc, listForProduct, report, moderate, latestApproved };
