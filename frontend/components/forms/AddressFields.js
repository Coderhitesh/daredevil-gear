'use client';

import Field from './Field';

export const STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

/** Address inputs bound to react-hook-form `register` under an optional name prefix. */
export default function AddressFields({ register, errors = {}, prefix = '', showBusiness = false }) {
  const n = (f) => (prefix ? `${prefix}.${f}` : f);
  const e = (f) => (prefix ? errors?.[prefix]?.[f]?.message : errors?.[f]?.message);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Full name" required autoComplete="name" {...register(n('fullName'))} error={e('fullName')} />
      <Field label="Mobile number" required type="tel" inputMode="tel" autoComplete="tel" {...register(n('phone'))} error={e('phone')} hint="For delivery updates" />
      <Field label="House / flat, building, street" required autoComplete="address-line1" className="sm:col-span-2" {...register(n('line1'))} error={e('line1')} />
      <Field label="Area, locality (optional)" autoComplete="address-line2" {...register(n('line2'))} error={e('line2')} />
      <Field label="Landmark (optional)" {...register(n('landmark'))} error={e('landmark')} />
      <Field label="PIN code" required inputMode="numeric" maxLength={6} autoComplete="postal-code" {...register(n('pincode'))} error={e('pincode')} />
      <Field label="City / town" required autoComplete="address-level2" {...register(n('city'))} error={e('city')} />
      <Field label="State / UT" required as="select" autoComplete="address-level1" className="sm:col-span-2" {...register(n('state'))} error={e('state')}>
        <option value="">Select state</option>
        {STATES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Field>
      {showBusiness ? (
        <>
          <Field label="Company name (optional)" {...register(n('companyName'))} error={e('companyName')} />
          <Field label="GSTIN (optional, for business invoices)" {...register(n('gstin'))} error={e('gstin')} />
        </>
      ) : null}
    </div>
  );
}
