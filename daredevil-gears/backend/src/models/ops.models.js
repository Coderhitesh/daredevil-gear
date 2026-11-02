'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;
const m = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

const ShippingZoneSchema = new Schema(
  {
    name: { type: String, required: true },
    scope: { type: String, enum: ['domestic', 'international'], default: 'domestic' },
    countries: [{ type: String, uppercase: true }],
    states: [String], // empty = all states of the country
    pincodePrefixes: [String], // empty = all pincodes
    excludedPincodes: [String],
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const ShippingRateSchema = new Schema(
  {
    zone: { type: Schema.Types.ObjectId, ref: 'ShippingZone', required: true, index: true },
    name: { type: String, required: true },
    method: { type: String, enum: ['standard', 'express', 'india_post'], default: 'standard' },
    type: { type: String, enum: ['flat', 'weight_slab'], default: 'flat' },
    flatCharge: { type: Number, default: 0 }, // paise incl. GST
    // weight_slab: first slab whose maxKg >= chargeable weight; above the last slab:
    // lastSlab.charge + ceil(weight - lastSlab.maxKg) * beyondPerKg
    slabs: [{ maxKg: Number, charge: Number, _id: false }],
    beyondPerKg: { type: Number, default: 0 },
    requiresReview: { type: Boolean, default: false },
    reviewNote: String,
    freeAbove: Number, // paise; null = never free
    minOrderValue: Number,
    estimatedDays: { min: Number, max: Number }, // only shown when configured
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const TaxConfigurationSchema = new Schema(
  {
    key: { type: String, default: 'default' },
    sellerState: { type: String, default: 'Uttar Pradesh' },
    sellerStateCode: { type: String, default: '09' },
    pricesIncludeTax: { type: Boolean, default: true },
    apparelRule: {
      thresholdPerPiece: { type: Number, default: 250000 }, // paise, transaction value excl. GST
      lowRate: { type: Number, default: 5 },
      highRate: { type: Number, default: 18 },
      effectiveFrom: { type: Date, default: () => new Date('2025-09-22') },
    },
    shippingTaxRate: { type: Number, default: 18 },
    packagingTaxMode: { type: String, enum: ['item_rate', 'fixed'], default: 'item_rate' },
    packagingFixedRate: { type: Number, default: 18 },
    reviewedByAccountant: { type: Boolean, default: false },
    reviewedAt: Date,
    reviewNote: String,
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
TaxConfigurationSchema.index({ key: 1 }, { unique: true });

const AuditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorEmail: String,
    actorRole: String,
    action: { type: String, required: true, index: true },
    entity: { type: String, index: true },
    entityId: String,
    summary: String,
    changes: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
AuditLogSchema.index({ createdAt: -1 });

const EmailLogSchema = new Schema(
  {
    to: { type: String, required: true },
    template: String,
    subject: String,
    status: { type: String, enum: ['queued', 'sent', 'failed', 'dev_outbox'], default: 'queued', index: true },
    error: String,
    attempts: { type: Number, default: 0 },
    order: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    messageId: String,
    sentAt: Date,
  },
  { timestamps: true }
);
EmailLogSchema.index({ createdAt: -1 });

const ImportRunSchema = new Schema(
  {
    kind: { type: String, default: 'products' },
    dryRun: Boolean,
    sourceFile: String,
    startedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    summary: Schema.Types.Mixed,
    report: Schema.Types.Mixed,
    status: { type: String, enum: ['completed', 'failed'], default: 'completed' },
  },
  { timestamps: true }
);

module.exports = {
  ShippingZone: m('ShippingZone', ShippingZoneSchema),
  ShippingRate: m('ShippingRate', ShippingRateSchema),
  TaxConfiguration: m('TaxConfiguration', TaxConfigurationSchema),
  AuditLog: m('AuditLog', AuditLogSchema),
  EmailLog: m('EmailLog', EmailLogSchema),
  ImportRun: m('ImportRun', ImportRunSchema),
};
