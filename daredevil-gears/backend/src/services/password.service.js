'use strict';

const argon2 = require('argon2');

// OWASP-recommended Argon2id parameters (19 MiB, t=2, p=1)
const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

// Precomputed hash used to equalise timing when the account does not exist.
let dummyHash = null;

async function hashPassword(password) {
  return argon2.hash(password, OPTIONS);
}

async function verifyPassword(hash, password) {
  if (!hash) {
    dummyHash = dummyHash || (await argon2.hash('timing-equaliser-password', OPTIONS));
    await argon2.verify(dummyHash, String(password || '')).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(hash, String(password || ''));
  } catch {
    return false;
  }
}

const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', 'qwerty123', 'iloveyou', 'admin123', 'welcome1', 'daredevil', 'daredevil123']);

/** Returns an error message, or null when the password is acceptable. */
function passwordProblem(password, { email, name } = {}) {
  const p = String(password || '');
  if (p.length < 10) return 'Use at least 10 characters';
  if (p.length > 128) return 'Use at most 128 characters';
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return 'Use a mix of letters and numbers';
  if (COMMON.has(p.toLowerCase())) return 'This password is too common';
  const local = String(email || '').split('@')[0].toLowerCase();
  if (local && local.length > 3 && p.toLowerCase().includes(local)) return 'Do not include your email in the password';
  if (name && name.length > 3 && p.toLowerCase().includes(name.toLowerCase().split(' ')[0])) return 'Do not include your name in the password';
  return null;
}

module.exports = { hashPassword, verifyPassword, passwordProblem };
