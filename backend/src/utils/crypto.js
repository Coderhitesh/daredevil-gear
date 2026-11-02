'use strict';

const crypto = require('crypto');

/** Cryptographically secure numeric OTP (uniform, no modulo bias). */
function generateOtp(length = 6) {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, '0');
}

function hmacSha256(secret, value) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Constant-time string comparison. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ---- TOTP (RFC 6238) for admin MFA, no external dependency ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function totp(secret, { time = Date.now(), step = 30, digits = 6 } = {}) {
  const counter = Math.floor(time / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).toString();
  return code.padStart(digits, '0');
}

function verifyTotp(secret, code, { window = 1, time = Date.now() } = {}) {
  if (!/^\d{6}$/.test(String(code || ''))) return false;
  for (let w = -window; w <= window; w++) {
    if (safeEqual(totp(secret, { time: time + w * 30000 }), code)) return true;
  }
  return false;
}

function totpUri({ secret, account, issuer = 'DareDevil Gears Admin' }) {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}

module.exports = {
  generateOtp,
  hmacSha256,
  sha256,
  randomToken,
  safeEqual,
  generateTotpSecret,
  totp,
  verifyTotp,
  totpUri,
};
