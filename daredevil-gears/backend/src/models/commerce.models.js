'use strict';

const mongoose = require('mongoose');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../shared');

const { Schema } = mongoose;
const m = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

// ---------------- Counter (order / invoice / ticket numbers) ----------------
const CounterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = m('Counter', CounterSchema);

async function nextSequence(name, session) {
  const doc = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { new: true, upsert: true, session });
  return doc.seq;
}

// ---------------- Cart ----------------
const CartItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variant: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    quantity: { type: Number, required: true, min: 1, max: 99 },
    seenUnitPrice: Number, // paise incl. GST when added — used only to tell the shopper a price changed
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const CartSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    guestTokenHash: String,
    items: { type: [CartItemSchema], validate: [(v) => v.length <= 50, 'Cart can hold at most 50 lines'] },
    couponCode: { type: String, uppercase: true, trim: true },
    expiresAt: Date,
  },
  { timestamps: true }
);
CartSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { user: { $type: 'objectId' } } });
CartSchema.index({ guestTokenHash: 1 }, { unique: true, partialFilterExpression: { guestTokenHash: { $type: 'string' } } });
CartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ---------------- Wishlist ----------------
const WishlistSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  },
  { timestamps: true }
);
WishlistSchema.index({ user: 1 }, { unique: true });

// ---------------- Order ----------------
const AddressSnapshotSchema = new Schema(
  {
    fullName: String,
    phone: String,
    line1: String,
    line2: String,
    landmark: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'IN' },
    gstin: String,
    companyName: String,
  },
  { _id: false }
);

/** OrderItem — immutable pricing/tax snapshot. Never recomputed from the live product. */
const OrderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    variant: { type: Schema.Types.ObjectId, ref: 'ProductVariant' },
    name: { type: String, required: true },
    variantTitle: String,
    sku: { type: String, required: true },
    slug: String,
    image: String,
    hsnCode: String,
    quantity: { type: Number, required: true, min: 1 },
    unitPriceInclusive: { type: Number, required: true }, // paise
    regularUnitPriceInclusive: Number,
    lineTotalInclusive: { type: Number, required: true }, // before coupon
    discount: { type: Number, default: 0 }, // coupon share, paise incl. GST
    packagingCharge: { type: Number, default: 0 },
    gstRate: { type: Number, required: true },
    taxableValue: { type: Number, required: true }, // after discount, excl. GST
    taxAmount: { type: Number, required: true },
    netTotal: { type: Number, required: true }, // lineTotal - discount (incl. GST)
    returnable: Boolean,
    returnWindowDays: Number,
    quantityCancelled: { type: Number, default: 0 },
    quantityReturned: { type: Number, default: 0 },
    quantityRefunded: { type: Number, default: 0 },
  },
  { _id: true }
);

const OrderSchema = new Schema(
  {
    orderNumber: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    isGuest: { type: Boolean, default: false },
    guestAccessHash: String, // sha256 of the guest's order token; never returned by any serializer
    email: { type: String, required: true, lowercase: true },
    phone: String,
    customerName: String,
    items: { type: [OrderItemSchema], validate: [(v) => v.length > 0, 'Order must have items'] },
    shippingAddress: { type: AddressSnapshotSchema, required: true },
    billingAddress: AddressSnapshotSchema,
    delivery: {
      zone: { type: Schema.Types.ObjectId, ref: 'ShippingZone' },
      rate: { type: Schema.Types.ObjectId, ref: 'ShippingRate' },
      method: String,
      label: String,
      estimatedDays: { min: Number, max: Number },
      provider: { type: String, enum: ['manual', 'shiprocket'], default: 'manual' },
      courierId: Number, // Shiprocket courier_company_id the customer was quoted
      courierName: String,
      etd: String,
      weightKg: Number,
    },
    // Shiprocket sync (created automatically after payment when enabled in Admin → Settings → Shiprocket)
    shiprocket: {
      status: { type: String, enum: ['not_sent', 'queued', 'pushed', 'awb_assigned', 'failed', 'cancelled'], default: 'not_sent' },
      orderId: String,
      shipmentId: String,
      awb: String,
      courierName: String,
      attempts: { type: Number, default: 0 },
      lastError: String,
      pushedAt: Date,
      lastTriedAt: Date,
    },
    pricing: {
      itemsTotal: Number, // sum lineTotalInclusive
      discount: { type: Number, default: 0 },
      couponCode: String,
      packagingCharge: { type: Number, default: 0 },
      packagingTax: { type: Number, default: 0 },
      shippingCharge: { type: Number, default: 0 },
      shippingTax: { type: Number, default: 0 },
      codCharge: { type: Number, default: 0 }, // cash-on-delivery fee incl. GST
      codTax: { type: Number, default: 0 },
      taxableTotal: Number,
      taxTotal: Number,
      grandTotal: { type: Number, required: true },
      taxBreakup: [{ rate: Number, taxable: Number, tax: Number, _id: false }],
      supplyType: { type: String, enum: ['intra', 'inter'] }, // CGST+SGST vs IGST
      cgst: Number,
      sgst: Number,
      igst: Number,
      currency: { type: String, default: 'INR' },
    },
    status: { type: String, enum: Object.values(ORDER_STATUS), default: ORDER_STATUS.PENDING_PAYMENT, index: true },
    statusHistory: [
      {
        from: String,
        to: String,
        at: { type: Date, default: Date.now },
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        byName: String,
        byRole: String,
        note: String,
        _id: false,
      },
    ],
    payment: {
      status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.CREATED },
      provider: { type: String, enum: ['razorpay', 'cod'], default: 'razorpay' },
      method: String,
      razorpayOrderId: String,
      razorpayPaymentId: String,
      paidAt: Date,
      amountPaid: { type: Number, default: 0 },
      amountRefunded: { type: Number, default: 0 },
    },
    inventory: {
      reserved: { type: Boolean, default: false },
      committed: { type: Boolean, default: false },
      released: { type: Boolean, default: false },
      restocked: { type: Boolean, default: false },
    },
    coupon: { type: Schema.Types.ObjectId, ref: 'Coupon' },
    shipment: { type: Schema.Types.ObjectId, ref: 'Shipment' },
    invoice: { number: String, generatedAt: Date },
    cancellation: { requestedAt: Date, reason: String, by: String, approvedAt: Date, rejectedReason: String },
    internalNotes: [{ note: String, by: { type: Schema.Types.ObjectId, ref: 'User' }, byName: String, at: { type: Date, default: Date.now } }],
    notifications: [{ type: { type: String }, to: String, status: String, at: { type: Date, default: Date.now }, _id: false }],
    idempotencyKey: String,
    ageConfirmedAt: Date,
    expiresAt: Date, // pending-payment hold expiry
    placedAt: Date,
    deliveredAt: Date,
    ip: String,
    userAgent: String,
  },
  { timestamps: true }
);
OrderSchema.index({ orderNumber: 1 }, { unique: true });
OrderSchema.index({ 'payment.razorpayOrderId': 1 }, { unique: true, partialFilterExpression: { 'payment.razorpayOrderId': { $type: 'string' } } });
OrderSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ status: 1, expiresAt: 1 });
OrderSchema.index({ email: 1 });

// ---------------- Payment ----------------
const PaymentSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    provider: { type: String, default: 'razorpay' },
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: String,
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.CREATED, index: true },
    method: String,
    verifiedVia: { type: String, enum: ['signature', 'webhook', 'reconcile', null], default: null },
    errorCode: String,
    errorDescription: String,
    errorReason: String,
    amountRefunded: { type: Number, default: 0 },
    events: [{ type: { type: String }, at: { type: Date, default: Date.now }, eventId: String, note: String, _id: false }],
    // Card numbers / CVV are never received or stored. Only provider identifiers and method metadata.
    meta: { bank: String, wallet: String, vpa: String, cardNetwork: String, cardLast4: String },
  },
  { timestamps: true }
);
PaymentSchema.index({ razorpayOrderId: 1 }, { unique: true });
PaymentSchema.index({ razorpayPaymentId: 1 }, { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: 'string' } } });

const WebhookEventSchema = new Schema(
  {
    provider: { type: String, default: 'razorpay' },
    eventId: { type: String, required: true },
    type: String,
    payloadHash: String,
    status: { type: String, enum: ['processing', 'processed', 'failed', 'ignored'], default: 'processing' },
    error: String,
    processedAt: Date,
  },
  { timestamps: true }
);
WebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

// ---------------- Refund ----------------
const RefundSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment' },
    returnRequest: { type: Schema.Types.ObjectId, ref: 'ReturnRequest' },
    razorpayRefundId: String,
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['pending', 'processed', 'failed'], default: 'pending', index: true },
    mode: { type: String, enum: ['razorpay', 'manual'], default: 'razorpay' }, // manual = paid by bank transfer/UPI (cash-on-delivery orders)
    manualReference: String, // UTR / UPI reference for manual refunds
    reason: String,
    items: [{ orderItem: Schema.Types.ObjectId, quantity: Number, _id: false }],
    restock: { type: Boolean, default: false },
    initiatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    idempotencyKey: String,
    failureReason: String,
    processedAt: Date,
  },
  { timestamps: true }
);
RefundSchema.index({ razorpayRefundId: 1 }, { unique: true, partialFilterExpression: { razorpayRefundId: { $type: 'string' } } });
RefundSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

// ---------------- Coupon ----------------
const CouponSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 30 },
    description: String,
    type: { type: String, enum: ['percent', 'fixed'], required: true },
    value: { type: Number, required: true, min: 1 }, // percent (1-90) or paise
    maxDiscount: Number, // paise cap for percent coupons
    minCartValue: { type: Number, default: 0 },
    startsAt: Date,
    endsAt: Date,
    usageLimit: Number,
    usageCount: { type: Number, default: 0 },
    perCustomerLimit: { type: Number, default: 1 },
    eligibleProducts: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    eligibleCategories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    excludeSaleItems: { type: Boolean, default: false },
    newCustomersOnly: { type: Boolean, default: false },
    stackable: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
CouponSchema.index({ code: 1 }, { unique: true });

const CouponRedemptionSchema = new Schema(
  {
    coupon: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    email: { type: String, lowercase: true },
    amount: Number,
    status: { type: String, enum: ['reserved', 'used', 'released'], default: 'reserved' },
  },
  { timestamps: true }
);
CouponRedemptionSchema.index({ coupon: 1, order: 1 }, { unique: true });
CouponRedemptionSchema.index({ coupon: 1, email: 1, status: 1 });

// ---------------- Returns ----------------
const ReturnRequestSchema = new Schema(
  {
    requestNumber: { type: String, required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    type: { type: String, enum: ['return', 'exchange', 'damaged_or_wrong'], default: 'return' },
    items: [{ orderItem: Schema.Types.ObjectId, sku: String, name: String, quantity: Number, _id: false }],
    reason: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 2000 },
    photos: [{ url: String, publicId: String }],
    status: {
      type: String,
      enum: ['requested', 'approved', 'rejected', 'pickup_scheduled', 'received', 'refund_initiated', 'refunded', 'closed'],
      default: 'requested',
      index: true,
    },
    returnShippingPaidBy: { type: String, enum: ['customer', 'store', null], default: null },
    deductionAmount: { type: Number, default: 0 },
    refund: { type: Schema.Types.ObjectId, ref: 'Refund' },
    adminNotes: String,
    history: [{ status: String, at: { type: Date, default: Date.now }, by: Schema.Types.ObjectId, note: String, _id: false }],
  },
  { timestamps: true }
);
ReturnRequestSchema.index({ requestNumber: 1 }, { unique: true });

// ---------------- Shipment ----------------
const ShipmentSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    provider: { type: String, enum: ['manual', 'shiprocket'], default: 'manual' },
    carrier: String,
    trackingNumber: String,
    trackingUrl: String,
    method: String,
    status: {
      type: String,
      enum: ['pending', 'packed', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'rto', 'cancelled'],
      default: 'pending',
    },
    events: [{ status: String, location: String, note: String, at: { type: Date, default: Date.now }, _id: false }],
    providerRef: String,
    shippedAt: Date,
    deliveredAt: Date,
  },
  { timestamps: true }
);

module.exports = {
  Counter,
  nextSequence,
  Cart: m('Cart', CartSchema),
  Wishlist: m('Wishlist', WishlistSchema),
  Order: m('Order', OrderSchema),
  Payment: m('Payment', PaymentSchema),
  WebhookEvent: m('WebhookEvent', WebhookEventSchema),
  Refund: m('Refund', RefundSchema),
  Coupon: m('Coupon', CouponSchema),
  CouponRedemption: m('CouponRedemption', CouponRedemptionSchema),
  ReturnRequest: m('ReturnRequest', ReturnRequestSchema),
  Shipment: m('Shipment', ShipmentSchema),
};
