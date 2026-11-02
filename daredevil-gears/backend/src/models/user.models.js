'use strict';

const mongoose = require('mongoose');
const { ROLES } = require('../shared');

const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 20 },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.CUSTOMER, index: true },
    status: { type: String, enum: ['active', 'suspended', 'pending_verification', 'deleted'], default: 'pending_verification', index: true },
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: Date,
    mfa: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, select: false },
      pendingSecret: { type: String, select: false },
      enrolledAt: Date,
    },
    notificationPrefs: {
      orderUpdates: { type: Boolean, default: true },
      marketing: { type: Boolean, default: false },
      whatsapp: { type: Boolean, default: false },
    },
    failedLoginCount: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    lastLoginAt: Date,
    tokenVersion: { type: Number, default: 0, select: false },
    supportNotes: [
      {
        note: { type: String, maxlength: 2000 },
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        byName: String,
        at: { type: Date, default: Date.now },
      },
    ],
    suspendedReason: String,
    privacyRequests: [
      {
        type: { type: String, enum: ['export', 'erasure', 'correction', 'withdraw_consent'] },
        status: { type: String, enum: ['open', 'completed', 'rejected'], default: 'open' },
        note: String,
        requestedAt: { type: Date, default: Date.now },
        completedAt: Date,
      },
    ],
    marketingConsentAt: Date,
    deletedAt: Date,
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ name: 'text', email: 'text', phone: 'text' });

UserSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    status: this.status,
    emailVerified: this.emailVerified,
    mfaEnabled: Boolean(this.mfa?.enabled),
    notificationPrefs: this.notificationPrefs,
    createdAt: this.createdAt,
  };
};

const SessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['customer', 'admin'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    userAgent: String,
    ip: String,
    expiresAt: { type: Date, required: true },
    lastUsedAt: Date,
    mfaSatisfied: { type: Boolean, default: false },
    revokedAt: Date,
    revokedReason: String,
  },
  { timestamps: true }
);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AddressSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, trim: true, maxlength: 40 },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    line1: { type: String, required: true, trim: true, maxlength: 200 },
    line2: { type: String, trim: true, maxlength: 200 },
    landmark: { type: String, trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    pincode: { type: String, required: true, trim: true, maxlength: 12 },
    country: { type: String, default: 'IN', maxlength: 2 },
    isDefaultShipping: { type: Boolean, default: false },
    isDefaultBilling: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const OtpFields = {
  email: { type: String, required: true, lowercase: true, trim: true },
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  sendCount: { type: Number, default: 1 },
  lastSentAt: { type: Date, default: Date.now },
  consumedAt: Date,
  ip: String,
};

const EmailVerificationSchema = new Schema(
  { ...OtpFields, purpose: { type: String, enum: ['verify_email'], default: 'verify_email' } },
  { timestamps: true }
);
EmailVerificationSchema.index({ email: 1, purpose: 1 });
// keep a day of history for rate limiting, then purge
EmailVerificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

const PasswordResetSchema = new Schema({ ...OtpFields }, { timestamps: true });
PasswordResetSchema.index({ email: 1 });
PasswordResetSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = {
  User: mongoose.models.User || mongoose.model('User', UserSchema),
  Session: mongoose.models.Session || mongoose.model('Session', SessionSchema),
  Address: mongoose.models.Address || mongoose.model('Address', AddressSchema),
  EmailVerification: mongoose.models.EmailVerification || mongoose.model('EmailVerification', EmailVerificationSchema),
  PasswordReset: mongoose.models.PasswordReset || mongoose.model('PasswordReset', PasswordResetSchema),
};
