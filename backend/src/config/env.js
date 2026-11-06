'use strict';

const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_PATH || path.resolve(__dirname, '../../.env') });
const { z } = require('zod');

const bool = (def) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === true || v === 'true' || v === '1'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  APP_NAME: z.string().default('DareDevil Gears'),
  STOREFRONT_URL: z.string().url().default('http://localhost:3000'),
  // where the API can reach the storefront server directly (e.g. http://frontend:3000 in Docker); defaults to STOREFRONT_URL
  STOREFRONT_INTERNAL_URL: z.string().url().optional(),
  REVALIDATE_SECRET: z.string().min(16).optional(),
  ADMIN_URL: z.string().url().default('http://localhost:3001'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().optional(),
  COOKIE_DOMAIN: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().default(0),

  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/daredevil_gears'),
  MONGODB_TRANSACTIONS: z.enum(['auto', 'on', 'off']).default('auto'),
  REDIS_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().default(8),
  ADMIN_MFA_REQUIRED: bool(true),

  OTP_TTL_MIN: z.coerce.number().int().default(10),
  OTP_RESEND_COOLDOWN_SEC: z.coerce.number().int().default(60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().default(5),
  OTP_PEPPER: z.string().min(16, 'OTP_PEPPER must be at least 16 chars'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // development escape hatch for PCs whose antivirus/proxy re-signs TLS traffic; refused in production
  SMTP_TLS_REJECT_UNAUTHORIZED: bool(true),
  MAIL_FROM_NAME: z.string().default('DareDevil Gears'),
  MAIL_FROM_ADDRESS: z.string().email().default('sales@daredevilgears.com'),
  ADMIN_NOTIFY_EMAIL: z.string().email().optional(),
  MAIL_DEV_OUTBOX: bool(true),

  CCAVENUE_MERCHANT_ID: z.string().optional(),
  CCAVENUE_ACCESS_CODE: z.string().optional(),
  CCAVENUE_WORKING_KEY: z.string().optional(),
  CCAVENUE_ENV: z.enum(['test', 'live']).default('test'),
  // public URL CCAvenue sends the customer back to (must be reachable by the browser); default STOREFRONT_URL + /api/v1/payments/ccavenue/response
  CCAVENUE_REDIRECT_URL: z.string().url().optional(),
  PAYMENT_EXPIRY_MIN: z.coerce.number().int().default(30),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().default('daredevil-gears'),

  SHIPPING_PROVIDER: z.enum(['manual', 'shiprocket']).default('manual'),
  SHIPROCKET_EMAIL: z.string().optional(),
  SHIPROCKET_PASSWORD: z.string().optional(),
  SHIPROCKET_API_BASE: z.string().url().optional(), // override only for a mock server in tests

  LOG_LEVEL: z.string().default('info'),
  SENTRY_DSN: z.string().optional(),

  SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SUPER_ADMIN_PASSWORD: z.string().optional(),
  SUPER_ADMIN_NAME: z.string().optional(),
});

function loadEnv(raw = process.env) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    // eslint-disable-next-line no-console
    console.error(`\n[config] Invalid environment configuration:\n${issues}\n`);
    process.exit(1);
  }
  const env = parsed.data;

  if (env.NODE_ENV === 'production') {
    const problems = [];
    if (!env.SMTP_HOST) problems.push('SMTP_HOST is required in production (OTP and order emails)');
    if (!env.SMTP_TLS_REJECT_UNAUTHORIZED) problems.push('SMTP_TLS_REJECT_UNAUTHORIZED=false is for local development only');
    if (!env.CCAVENUE_MERCHANT_ID || !env.CCAVENUE_ACCESS_CODE || !env.CCAVENUE_WORKING_KEY) problems.push('CCAvenue merchant id, access code and working key are required in production');
    if (env.STOREFRONT_URL.startsWith('http://')) problems.push('STOREFRONT_URL must be https in production');
    if (env.ADMIN_URL.startsWith('http://')) problems.push('ADMIN_URL must be https in production');
    if (!env.ADMIN_MFA_REQUIRED) problems.push('ADMIN_MFA_REQUIRED cannot be false in production');
    const secrets = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ADMIN_JWT_SECRET', 'OTP_PEPPER'];
    for (const k of secrets) if (/change-?me|example|placeholder/i.test(env[k])) problems.push(`${k} still has the example value`);
    if (new Set(secrets.map((k) => env[k])).size !== secrets.length) problems.push('JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ADMIN_JWT_SECRET and OTP_PEPPER must all be different');
    if (problems.length) {
      // eslint-disable-next-line no-console
      console.error(`\n[config] Production configuration incomplete:\n${problems.map((p) => '  - ' + p).join('\n')}\n`);
      process.exit(1);
    }
  }

  env.isProd = env.NODE_ENV === 'production';
  env.isTest = env.NODE_ENV === 'test';
  env.corsOrigins = (env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',') : [env.STOREFRONT_URL, env.ADMIN_URL])
    .map((s) => s.trim())
    .filter(Boolean);
  env.smtpConfigured = Boolean(env.SMTP_HOST);
  env.ccavenueConfigured = Boolean(env.CCAVENUE_MERCHANT_ID && env.CCAVENUE_ACCESS_CODE && env.CCAVENUE_WORKING_KEY);
  env.cloudinaryConfigured = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
  env.ccavenueMode = env.CCAVENUE_ENV;
  env.loadEnv = loadEnv;
  return Object.freeze(env);
}

module.exports = loadEnv();
