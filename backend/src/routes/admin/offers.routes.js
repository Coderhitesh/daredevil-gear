'use strict';

/**
 * Admin → Offers: automatic combo ("buy together for ₹X") and multi-buy ("buy 3+, get 10% off") offers.
 * A combo price must be lower than what the items cost today, so the "you save" shown to customers
 * is always real.
 */
const router = require('express').Router();
const { ApiError } = require('../../utils/http');
const { crud } = require('./crud');
const { Offer, Order, Product, ProductVariant } = require('../../models');
const pricing = require('../../services/pricing.service');
const offerService = require('../../services/offer.service');
const { z, objectId, paise, safeText } = require('../../validators/schemas');

const rupees = (p) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const offerBody = z.object({
  name: z.string().trim().min(3).max(120),
  description: safeText(300).optional(),
  type: z.enum(['bundle', 'multi_buy']),
  items: z.array(z.object({ product: objectId, variant: objectId.nullable().optional(), quantity: z.number().int().min(1).max(20) })).max(10).optional(),
  bundlePrice: paise.nullable().optional(),
  eligibleProducts: z.array(objectId).max(500).optional(),
  eligibleCategories: z.array(objectId).max(100).optional(),
  minQuantity: z.number().int().min(2).max(50).optional(),
  percentOff: z.number().int().min(1).max(90).nullable().optional(),
  maxDiscount: paise.nullable().optional(),
  combinableWithCoupons: z.boolean().optional(),
  showOnProductPage: z.boolean().optional(),
  image: z.object({ url: z.string().url().optional().or(z.literal('')), publicId: z.string().optional() }).nullable().optional(),
  priority: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});

/** Today's price of one complete set. */
async function regularSetPrice(items) {
  let total = 0;
  for (const it of items) {
    const product = await Product.findById(it.product).lean();
    if (!product) throw ApiError.badRequest('A product in this combo no longer exists');
    const variant = it.variant ? await ProductVariant.findById(it.variant).lean() : await ProductVariant.findOne({ product: product._id, isDefault: true }).lean();
    if (!variant) throw ApiError.badRequest(`${product.name} has no variant to sell`);
    total += pricing.unitPrice(product, variant).unit * it.quantity;
  }
  return total;
}

router.use(
  '/offers',
  crud({
    Model: Offer,
    schema: offerBody,
    entity: 'Offer',
    read: 'orders:read',
    write: 'coupons:write',
    searchFields: ['name', 'description'],
    filters: { type: 'type', active: 'isActive' },
    sort: { priority: 1, createdAt: -1 },
    populate: [{ path: 'items.product', select: 'name sku slug pricing' }],
    beforeSave: async (data, req, doc) => {
      const merged = { ...(doc ? doc.toObject() : {}), ...data };
      if (merged.startsAt && merged.endsAt && new Date(merged.endsAt) <= new Date(merged.startsAt)) throw ApiError.badRequest('End date must be after start date');
      if (merged.type === 'bundle') {
        const items = (merged.items || []).filter((i) => i.product);
        const units = items.reduce((s, i) => s + (i.quantity || 1), 0);
        if (!items.length || units < 2) throw ApiError.unprocessable('Add at least 2 units to the combo (two products, or one product with quantity 2+)', { details: [{ field: 'items', message: 'Add products to the combo' }] });
        if (new Set(items.map((i) => `${i.product}:${i.variant || ''}`)).size !== items.length) throw ApiError.unprocessable('The same product is listed twice — increase its quantity instead', { details: [{ field: 'items', message: 'Duplicate product' }] });
        if (!merged.bundlePrice) throw ApiError.unprocessable('Enter the combo price', { details: [{ field: 'bundlePrice', message: 'Required' }] });
        const regular = await regularSetPrice(items);
        if (merged.bundlePrice >= regular) {
          throw ApiError.unprocessable(`The combo price must be lower than the items cost today (${rupees(regular)}).`, { details: [{ field: 'bundlePrice', message: `Must be below ${rupees(regular)}` }] });
        }
      } else {
        if (!merged.percentOff) throw ApiError.unprocessable('Enter the % off', { details: [{ field: 'percentOff', message: 'Required' }] });
        if (!(merged.eligibleProducts || []).length && !(merged.eligibleCategories || []).length) throw ApiError.unprocessable('Choose the products or categories this offer is for', { details: [{ field: 'eligibleProducts', message: 'Choose products or categories' }] });
      }
      return data;
    },
    afterChange: async () => offerService.clearCache(),
    canDelete: async (doc) => ((await Order.exists({ 'pricing.offers.offerId': String(doc._id) })) ? 'Orders have used this offer — switch it off instead of deleting it' : null),
  })
);

module.exports = router;
