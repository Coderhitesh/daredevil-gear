'use strict';

const mongoose = require('mongoose');
const { PRODUCT_STATUS } = require('../shared');

const { Schema } = mongoose;

const SeoSchema = new Schema(
  {
    title: { type: String, maxlength: 70 },
    description: { type: String, maxlength: 170 },
    canonical: String,
    noindex: { type: Boolean, default: false },
  },
  { _id: false }
);

const ImageSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: String,
    alt: { type: String, maxlength: 160 },
    width: Number,
    height: Number,
    sortOrder: { type: Number, default: 0 },
  },
  { _id: true }
);

// ---------------- Category ----------------
const CategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    ancestors: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    description: { type: String, maxlength: 2000 },
    image: ImageSchema,
    banner: ImageSchema,
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    showInNav: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    productCount: { type: Number, default: 0 },
    seo: SeoSchema,
    sourceNames: [String],
  },
  { timestamps: true }
);
CategorySchema.index({ slug: 1 }, { unique: true });

// ---------------- Brand ----------------
const BrandSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true },
    isOwnBrand: { type: Boolean, default: false },
    authorisedDistributorProof: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    notes: String,
  },
  { timestamps: true }
);
BrandSchema.index({ slug: 1 }, { unique: true });

// ---------------- Collection ----------------
const CollectionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true },
    description: String,
    image: ImageSchema,
    products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    seo: SeoSchema,
  },
  { timestamps: true }
);
CollectionSchema.index({ slug: 1 }, { unique: true });

// ---------------- Product ----------------
const SpecSchema = new Schema(
  {
    label: { type: String, maxlength: 120 },
    value: { type: String, maxlength: 1000 },
    isPublic: { type: Boolean, default: true },
    note: String,
  },
  { _id: false }
);

const FlagSchema = new Schema(
  {
    code: { type: String, required: true },
    severity: { type: String, enum: ['blocking', 'warning'], default: 'warning' },
    message: String,
    field: String,
    evidence: String,
    resolvedAt: Date,
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolutionNote: String,
  },
  { _id: true, timestamps: false }
);

const ProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    sourceKey: { type: String, trim: true },
    sku: { type: String, uppercase: true, trim: true }, // default variant SKU (denormalised for display/search)
    brand: { type: Schema.Types.ObjectId, ref: 'Brand', default: null },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    categoryPath: [{ type: Schema.Types.ObjectId, ref: 'Category', index: true }],
    tags: [{ type: String, lowercase: true, trim: true }],
    variantGroup: { type: String, index: true },
    variantLabel: String,

    shortDescription: { type: String, maxlength: 500 },
    description: { type: String, maxlength: 20000 },
    features: [{ type: String, maxlength: 600 }],
    specifications: [SpecSchema],
    images: [ImageSchema],
    videos: [{ url: String, provider: String, title: String }],

    pricing: {
      priceInclusive: { type: Number, required: true, min: 0 }, // regular consumer price, paise, incl. GST
      gstRule: { type: String, enum: ['fixed', 'apparel_threshold'], default: 'fixed' },
      gstRate: { type: Number, required: true, enum: [0, 5, 12, 18, 28, 40] },
      sourceBasePrice: Number, // paise ex-GST as supplied by the business (reference only)
      sale: {
        active: { type: Boolean, default: false },
        priceInclusive: Number,
        startsAt: Date,
        endsAt: Date,
        reason: String,
        referencePriceEvidence: String, // where the struck-through price was actually charged
      },
    },
    hsnCode: { type: String, trim: true },
    hsnVerified: { type: Boolean, default: false },
    packagingCharge: { type: Number, default: 0, min: 0 }, // paise, GST-inclusive
    weightKg: { type: Number, min: 0 },
    dimensionsCm: { l: Number, w: Number, h: Number },

    status: { type: String, enum: Object.values(PRODUCT_STATUS), default: PRODUCT_STATUS.DRAFT, index: true },
    publishedAt: Date,
    statusHistory: [
      {
        from: String,
        to: String,
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        note: String,
        at: { type: Date, default: Date.now },
      },
    ],

    compliance: {
      countryOfOrigin: String,
      manufacturer: { name: String, address: String },
      importer: { name: String, address: String },
      packer: { name: String, address: String },
      netQuantity: String,
      consumerCare: String,
      safetyInstructions: String,
      warnings: [String],
      certificates: [
        {
          name: String,
          standard: String,
          fileUrl: String,
          issuedBy: String,
          verified: { type: Boolean, default: false },
          verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        },
      ],
      minAge: { type: Number, default: 0 },
      domesticOnly: { type: Boolean, default: false },
      allowedCountries: [String],
      blockedStates: [String],
      dangerousGoods: { type: Boolean, default: false },
      legalReview: {
        required: { type: Boolean, default: false },
        status: { type: String, enum: ['not_required', 'pending', 'approved', 'rejected'], default: 'not_required' },
        notes: String,
        reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        reviewedAt: Date,
      },
      returnable: { type: Boolean, default: true },
      returnWindowDays: { type: Number, default: 7 },
      supportingDocs: [{ name: String, url: String }],
    },

    flags: [FlagSchema],
    seo: SeoSchema,
    ratings: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
    salesCount: { type: Number, default: 0, index: true },
    availableQty: { type: Number, default: 0 },
    stockStatus: { type: String, enum: ['in_stock', 'out_of_stock'], default: 'out_of_stock', index: true },
    viewCount: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    searchText: { type: String, select: false },

    source: {
      sheet: String,
      row: Number,
      importedAt: Date,
      hash: String,
      sourceCategory: String,
      raw: { type: Schema.Types.Mixed, select: false },
    },
    manuallyEditedFields: [String],
    archivedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

ProductSchema.index({ slug: 1 }, { unique: true });
ProductSchema.index({ sku: 1 }, { unique: true, partialFilterExpression: { sku: { $type: 'string' } } });
ProductSchema.index({ sourceKey: 1 }, { unique: true, partialFilterExpression: { sourceKey: { $type: 'string' } } });
ProductSchema.index({ status: 1, category: 1, 'pricing.priceInclusive': 1 });
ProductSchema.index({ status: 1, createdAt: -1 });
ProductSchema.index({ name: 'text', tags: 'text', shortDescription: 'text', description: 'text' }, { weights: { name: 10, tags: 5, shortDescription: 2, description: 1 }, name: 'product_text' });

ProductSchema.pre('save', function buildSearchText(next) {
  const parts = [this.name, this.sku, ...(this.tags || []), this.variantLabel, this.shortDescription, this.hsnCode, this.source?.sourceCategory];
  this.searchText = parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  next();
});

ProductSchema.virtual('hasBlockingFlags').get(function hasBlockingFlags() {
  return (this.flags || []).some((f) => f.severity === 'blocking' && !f.resolvedAt);
});

// ---------------- Variant ----------------
const VariantSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    sku: { type: String, required: true, uppercase: true, trim: true },
    title: { type: String, default: 'Default' },
    options: { type: Map, of: String, default: {} },
    priceInclusive: { type: Number, min: 0 }, // optional override, paise incl. GST
    stock: { type: Number, default: 0, min: 0 }, // physical on-hand
    reserved: { type: Number, default: 0, min: 0 }, // held by pending payments
    available: { type: Number, default: 0, min: 0 }, // stock - reserved, maintained atomically
    lowStockThreshold: { type: Number, default: 5 },
    trackInventory: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    weightKg: Number,
    barcode: String,
  },
  { timestamps: true }
);
VariantSchema.index({ sku: 1 }, { unique: true });
VariantSchema.index({ available: 1 });

// ---------------- Inventory movement ----------------
const InventoryMovementSchema = new Schema(
  {
    variant: { type: Schema.Types.ObjectId, ref: 'ProductVariant', required: true, index: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', index: true },
    sku: String,
    type: {
      type: String,
      enum: ['import', 'adjustment', 'reserve', 'release', 'sale', 'restock_cancel', 'restock_return', 'correction', 'damaged'],
      required: true,
    },
    quantity: { type: Number, required: true }, // signed effect on stock (reserve/release: signed effect on reserved)
    stockAfter: Number,
    availableAfter: Number,
    reason: String,
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
InventoryMovementSchema.index({ createdAt: -1 });

// ---------------- Catalogue blocklist (hide/remove lists) ----------------
const CatalogBlocklistSchema = new Schema(
  {
    name: { type: String, required: true },
    key: { type: String, required: true },
    list: { type: String, enum: ['hide', 'remove', 'remove_page'], required: true },
    reason: String,
    source: String,
  },
  { timestamps: true }
);
CatalogBlocklistSchema.index({ key: 1, list: 1 }, { unique: true });

const m = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

module.exports = {
  Category: m('Category', CategorySchema),
  Brand: m('Brand', BrandSchema),
  Collection: m('Collection', CollectionSchema),
  Product: m('Product', ProductSchema),
  ProductVariant: m('ProductVariant', VariantSchema),
  InventoryMovement: m('InventoryMovement', InventoryMovementSchema),
  CatalogBlocklist: m('CatalogBlocklist', CatalogBlocklistSchema),
};
