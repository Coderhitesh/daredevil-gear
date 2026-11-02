'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;
const m = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

// ---------------- Reviews (genuine only — no seeding) ----------------
const ReviewSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    authorName: String,
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, maxlength: 120 },
    body: { type: String, required: true, minlength: 10, maxlength: 4000 },
    isVerifiedPurchase: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    rejectionReason: String,
    reports: [{ user: Schema.Types.ObjectId, reason: String, at: { type: Date, default: Date.now }, _id: false }],
    reportCount: { type: Number, default: 0 },
    moderatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    moderatedAt: Date,
  },
  { timestamps: true }
);
ReviewSchema.index({ product: 1, user: 1 }, { unique: true });
ReviewSchema.index({ status: 1, createdAt: -1 });

// ---------------- Banners ----------------
const BannerSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 140 },
    eyebrow: { type: String, maxlength: 60 },
    subtitle: { type: String, maxlength: 300 },
    ctaLabel: { type: String, maxlength: 40 },
    ctaHref: String,
    secondaryCtaLabel: String,
    secondaryCtaHref: String,
    linkHref: String, // whole banner is clickable and opens this page
    openInNewTab: { type: Boolean, default: false },
    layout: { type: String, enum: ['overlay', 'image_only'], default: 'overlay' }, // image_only = designed banner with text in the picture
    durationSeconds: { type: Number, min: 3, max: 30, default: 6 },
    image: { desktop: String, mobile: String, alt: String, publicId: String },
    placement: { type: String, enum: ['hero', 'promo', 'category', 'offer'], default: 'hero', index: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product' }, // offer posts: clicking opens this product
    theme: { type: String, enum: ['dark', 'light'], default: 'dark' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    startsAt: Date,
    endsAt: Date,
  },
  { timestamps: true }
);

// ---------------- Homepage sections ----------------
const HomeSectionSchema = new Schema(
  {
    key: { type: String, required: true },
    type: {
      type: String,
      enum: ['hero', 'offers', 'combos', 'featured_categories', 'product_rail', 'collection_rail', 'story', 'promo_banners', 'recently_viewed', 'reviews', 'trust', 'newsletter', 'bulk_orders'],
      required: true,
    },
    title: String,
    subtitle: String,
    isVisible: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    config: {
      source: { type: String, enum: ['bestsellers', 'new', 'featured', 'manual', 'collection', 'category'], default: 'new' },
      products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
      collection: { type: Schema.Types.ObjectId, ref: 'Collection' },
      category: { type: Schema.Types.ObjectId, ref: 'Category' },
      categories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
      limit: { type: Number, default: 8, max: 24 },
      body: String,
      image: String,
      imageAlt: String,
      ctaLabel: String,
      ctaHref: String,
      items: [{ title: String, text: String, icon: String, _id: false }],
    },
  },
  { timestamps: true }
);
HomeSectionSchema.index({ key: 1 }, { unique: true });

// ---------------- CMS pages ----------------
const CMSPageSchema = new Schema(
  {
    slug: { type: String, required: true, lowercase: true },
    title: { type: String, required: true },
    body: { type: String, default: '' }, // sanitized HTML
    excerpt: String,
    group: { type: String, enum: ['policy', 'company', 'help'], default: 'help' },
    seo: { title: String, description: String },
    isPublished: { type: Boolean, default: true },
    requiresReview: { type: Boolean, default: false },
    reviewNotes: String,
    pendingFields: [String],
    sortOrder: { type: Number, default: 0 },
    version: { type: Number, default: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
CMSPageSchema.index({ slug: 1 }, { unique: true });

// ---------------- Navigation ----------------
const NavItemSchema = new Schema({ label: String, href: String, children: [{ label: String, href: String, _id: false }] }, { _id: false });
const NavigationMenuSchema = new Schema({ key: { type: String, required: true }, title: String, items: [NavItemSchema] }, { timestamps: true });
NavigationMenuSchema.index({ key: 1 }, { unique: true });

// ---------------- Settings ----------------
const SiteSettingSchema = new Schema(
  {
    key: { type: String, required: true },
    value: Schema.Types.Mixed,
    isPublic: { type: Boolean, default: false },
    requiresReview: { type: Boolean, default: false },
    reviewNote: String,
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
SiteSettingSchema.index({ key: 1 }, { unique: true });

const EmailTemplateSchema = new Schema(
  {
    key: { type: String, required: true },
    subject: String,
    heading: String,
    intro: String,
    footerNote: String,
    isActive: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
EmailTemplateSchema.index({ key: 1 }, { unique: true });

// ---------------- Newsletter ----------------
const NewsletterSubscriberSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    status: { type: String, enum: ['subscribed', 'unsubscribed'], default: 'subscribed' },
    unsubscribeTokenHash: String,
    source: String,
    consentAt: Date,
    unsubscribedAt: Date,
    ip: String,
  },
  { timestamps: true }
);
NewsletterSubscriberSchema.index({ email: 1 }, { unique: true });

// ---------------- SEO redirects ----------------
const SeoRedirectSchema = new Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    statusCode: { type: Number, enum: [301, 302, 410], default: 301 },
    isActive: { type: Boolean, default: true },
    hits: { type: Number, default: 0 },
    note: String,
  },
  { timestamps: true }
);
SeoRedirectSchema.index({ from: 1 }, { unique: true });

// ---------------- Grievances ----------------
const GrievanceComplaintSchema = new Schema(
  {
    ticketNumber: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: String,
    orderNumber: String,
    category: { type: String, enum: ['order', 'payment', 'product', 'delivery', 'refund', 'privacy', 'other'], default: 'other' },
    subject: { type: String, required: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 5000 },
    status: { type: String, enum: ['open', 'acknowledged', 'in_progress', 'resolved', 'closed'], default: 'open', index: true },
    acknowledgedAt: Date,
    resolvedAt: Date,
    dueAcknowledgeBy: Date,
    dueResolveBy: Date,
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    resolution: String,
    history: [{ status: String, note: String, by: Schema.Types.ObjectId, at: { type: Date, default: Date.now }, _id: false }],
  },
  { timestamps: true }
);
GrievanceComplaintSchema.index({ ticketNumber: 1 }, { unique: true });

// ---------------- Contact / bulk orders ----------------
const ContactMessageSchema = new Schema(
  {
    type: { type: String, enum: ['contact', 'bulk_order'], default: 'contact', index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: String,
    subject: String,
    message: { type: String, required: true, maxlength: 5000 },
    bulk: { organisation: String, quantity: String, deliveryLocation: String, products: String, isGovernment: Boolean },
    status: { type: String, enum: ['new', 'in_progress', 'closed'], default: 'new' },
    ip: String,
  },
  { timestamps: true }
);

// ---------------- Search analytics ----------------
const SearchQuerySchema = new Schema(
  {
    term: { type: String, required: true, maxlength: 120 },
    normalized: { type: String, index: true },
    resultCount: Number,
    user: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
SearchQuerySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

module.exports = {
  Review: m('Review', ReviewSchema),
  Banner: m('Banner', BannerSchema),
  HomeSection: m('HomeSection', HomeSectionSchema),
  CMSPage: m('CMSPage', CMSPageSchema),
  NavigationMenu: m('NavigationMenu', NavigationMenuSchema),
  SiteSetting: m('SiteSetting', SiteSettingSchema),
  EmailTemplate: m('EmailTemplate', EmailTemplateSchema),
  NewsletterSubscriber: m('NewsletterSubscriber', NewsletterSubscriberSchema),
  SeoRedirect: m('SeoRedirect', SeoRedirectSchema),
  GrievanceComplaint: m('GrievanceComplaint', GrievanceComplaintSchema),
  ContactMessage: m('ContactMessage', ContactMessageSchema),
  SearchQuery: m('SearchQuery', SearchQuerySchema),
};
