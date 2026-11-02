'use strict';

const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const password = z.string().min(1, 'Password is required').max(128);
const otp = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');
const phone = z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');
const pincode = z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code');
const name = z.string().trim().min(2, 'Enter your name').max(120);
const paise = z.coerce.number().int().min(0);
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens');
const safeText = (max = 2000) => z.string().trim().max(max);

const address = z.object({
  label: safeText(40).optional(),
  fullName: name,
  phone,
  line1: z.string().trim().min(3, 'Enter the house / building and street').max(200),
  line2: safeText(200).optional().or(z.literal('')),
  landmark: safeText(120).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Enter the city').max(80),
  state: z.string().trim().min(2, 'Select the state').max(80),
  pincode,
  country: z.string().trim().length(2).default('IN'),
  gstin: z.string().trim().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Invalid GSTIN').optional().or(z.literal('')),
  companyName: safeText(120).optional().or(z.literal('')),
  isDefaultShipping: z.boolean().optional(),
  isDefaultBilling: z.boolean().optional(),
});

const pagination = {
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
};

const listProductsQuery = z.object({
  ...pagination,
  sort: z.enum(['featured', 'newest', 'price_asc', 'price_desc', 'popular', 'rating', 'name']).default('featured'),
  category: slug.optional(),
  collection: slug.optional(),
  brand: z.string().max(200).optional(),
  minPrice: paise.optional(),
  maxPrice: paise.optional(),
  inStock: z.enum(['true', 'false', '1', '0']).optional().transform((v) => v === 'true' || v === '1'),
  q: z.string().trim().max(80).optional(),
  ids: z.string().optional().transform((v) => (v ? v.split(',').filter((x) => /^[a-f\d]{24}$/i.test(x)).slice(0, 50) : undefined)),
});

module.exports = { z, objectId, email, password, otp, phone, pincode, name, paise, slug, safeText, address, pagination, listProductsQuery };
