import { z } from 'zod';

export const phone = z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number');
export const pincode = z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code');
export const email = z.string().trim().toLowerCase().email('Enter a valid email address');

export const addressSchema = z.object({
  label: z.string().trim().max(40).optional().or(z.literal('')),
  fullName: z.string().trim().min(2, 'Enter the full name'),
  phone,
  line1: z.string().trim().min(3, 'Enter the house / building and street'),
  line2: z.string().trim().max(200).optional().or(z.literal('')),
  landmark: z.string().trim().max(120).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Enter the city'),
  state: z.string().trim().min(2, 'Select the state'),
  pincode,
  country: z.string().default('IN'),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN')
    .optional()
    .or(z.literal('')),
  companyName: z.string().trim().max(120).optional().or(z.literal('')),
});

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128)
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), 'Use a mix of letters and numbers');

export function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined));
}
