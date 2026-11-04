'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Field from './Field';
import { api, fieldErrors } from '@/lib/api-client';
import { email, phone } from '@/lib/validation';

const base = {
  name: z.string().trim().min(2, 'Enter your name'),
  email,
  phone: phone.optional().or(z.literal('')),
  subject: z.string().trim().max(150).optional(),
  message: z.string().trim().min(10, 'Please write a little more'),
  website: z.string().max(0).optional(),
};
const bulkSchema = z.object({
  ...base,
  organisation: z.string().trim().min(2, 'Enter your organisation'),
  quantity: z.string().trim().min(1, 'Approximate quantity'),
  deliveryLocation: z.string().trim().min(2, 'Where should it be delivered?'),
  products: z.string().trim().optional(),
  isGovernment: z.boolean().optional(),
});

export default function ContactForm({ bulk = false }) {
  const [done, setDone] = useState('');
  const { register, handleSubmit, formState, setError } = useForm({ resolver: zodResolver(bulk ? bulkSchema : z.object(base)) });
  const submit = async (v) => {
    const body = { name: v.name, email: v.email, phone: v.phone || undefined, subject: v.subject || (bulk ? 'Bulk / institutional order' : undefined), message: v.message, website: v.website };
    if (bulk) body.bulk = { organisation: v.organisation, quantity: v.quantity, deliveryLocation: v.deliveryLocation, products: v.products, isGovernment: Boolean(v.isGovernment) };
    try {
      const res = await api('/contact', { method: 'POST', body });
      setDone(res.message);
    } catch (err) {
      Object.entries(fieldErrors(err)).forEach(([k, m]) => setError(k.replace(/^bulk\./, ''), { message: m }));
      setError('root', { message: err.message });
    }
  };
  if (done) {
    return (
      <p className="panel p-5" role="status">
        {done}
      </p>
    );
  }
  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Name" required autoComplete="name" {...register('name')} error={formState.errors.name?.message} />
      <Field label="Email" type="email" required autoComplete="email" {...register('email')} error={formState.errors.email?.message} />
      <Field label="Phone (optional)" type="tel" autoComplete="tel" {...register('phone')} error={formState.errors.phone?.message} />
      {bulk ? (
        <>
          <Field label="Organisation / unit" required {...register('organisation')} error={formState.errors.organisation?.message} />
          <Field label="Approximate quantity" required {...register('quantity')} error={formState.errors.quantity?.message} />
          <Field label="Delivery location" required {...register('deliveryLocation')} error={formState.errors.deliveryLocation?.message} />
          <Field label="Products of interest" className="sm:col-span-2" placeholder="e.g. Combat Rucksack 95 L, Jungle Pattern Cap" {...register('products')} />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="accent-signal" {...register('isGovernment')} /> This is a government / institutional purchase
          </label>
        </>
      ) : (
        <Field label="Subject" {...register('subject')} />
      )}
      <Field label={bulk ? 'Anything else we should know?' : 'Message'} as="textarea" required className="sm:col-span-2" {...register('message')} error={formState.errors.message?.message} />
      <input type="text" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" {...register('website')} />
      {formState.errors.root ? <p className="field-error sm:col-span-2">{formState.errors.root.message}</p> : null}
      <div className="sm:col-span-2">
        <button type="submit" className="btn-dark" disabled={formState.isSubmitting}>
          {bulk ? 'Request a quote' : 'Send message'}
        </button>
      </div>
    </form>
  );
}
