'use strict';

const env = require('../config/env');
const { generateOtp, hmacSha256, safeEqual } = require('../utils/crypto');
const { ApiError } = require('../utils/http');

const MAX_SENDS_PER_DAY = 6;

function hashCode(email, purpose, code) {
  return hmacSha256(env.OTP_PEPPER, `${purpose}:${String(email).toLowerCase()}:${code}`);
}

/**
 * Issue a fresh OTP for (Model, email, purpose). Enforces resend cooldown and daily cap.
 * Previous unconsumed codes are invalidated. Returns the plaintext code (only for emailing).
 */
async function issue(Model, { email, user, purpose = 'verify_email', ip }) {
  const now = Date.now();
  const filter = Model.modelName === 'EmailVerification' ? { email, purpose } : { email };
  const recent = await Model.find({ ...filter, createdAt: { $gte: new Date(now - 86400_000) } })
    .sort({ createdAt: -1 })
    .limit(MAX_SENDS_PER_DAY + 1)
    .lean();

  const last = recent[0];
  if (last && now - new Date(last.lastSentAt || last.createdAt).getTime() < env.OTP_RESEND_COOLDOWN_SEC * 1000) {
    const wait = Math.ceil((env.OTP_RESEND_COOLDOWN_SEC * 1000 - (now - new Date(last.lastSentAt || last.createdAt).getTime())) / 1000);
    throw ApiError.tooMany(`Please wait ${wait}s before requesting another code`, { code: 'OTP_COOLDOWN', details: [{ field: 'retryAfter', message: String(wait) }] });
  }
  if (recent.length >= MAX_SENDS_PER_DAY) throw ApiError.tooMany('Too many codes requested today. Please try again tomorrow.', { code: 'OTP_DAILY_LIMIT' });

  // invalidate earlier codes
  await Model.updateMany({ ...filter, consumedAt: null }, { $set: { consumedAt: new Date(), expiresAt: new Date() } });

  const code = generateOtp(6);
  const record = await Model.create({
    ...filter,
    user,
    codeHash: hashCode(email, purpose, code),
    expiresAt: new Date(now + env.OTP_TTL_MIN * 60_000),
    lastSentAt: new Date(now),
    ip,
  });
  return { code, record };
}

/**
 * Verify an OTP. Single-use, expiring, attempt-limited, constant-time comparison.
 * Error messages are generic so they do not reveal whether the email has an account.
 */
async function verify(Model, { email, purpose = 'verify_email', code }) {
  const filter = Model.modelName === 'EmailVerification' ? { email, purpose } : { email };
  const record = await Model.findOne({ ...filter, consumedAt: null }).sort({ createdAt: -1 });
  const invalid = ApiError.badRequest('The code is invalid or has expired', { code: 'OTP_INVALID' });
  if (!record) throw invalid;
  if (record.expiresAt < new Date()) throw invalid;
  if (record.attempts >= env.OTP_MAX_ATTEMPTS) {
    throw ApiError.tooMany('Too many incorrect attempts. Request a new code.', { code: 'OTP_LOCKED' });
  }
  // atomic attempt increment guards against parallel guessing
  const updated = await Model.findOneAndUpdate(
    { _id: record._id, consumedAt: null, attempts: { $lt: env.OTP_MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true }
  );
  if (!updated) throw ApiError.tooMany('Too many incorrect attempts. Request a new code.', { code: 'OTP_LOCKED' });

  if (!/^\d{6}$/.test(String(code || '')) || !safeEqual(updated.codeHash, hashCode(email, purpose, code))) throw invalid;

  const consumed = await Model.findOneAndUpdate({ _id: record._id, consumedAt: null }, { $set: { consumedAt: new Date() } }, { new: true });
  if (!consumed) throw invalid; // used concurrently
  return consumed;
}

module.exports = { issue, verify, hashCode };
