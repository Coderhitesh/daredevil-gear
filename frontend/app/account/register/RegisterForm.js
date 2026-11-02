'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Field from '@/components/forms/Field';
import { api, fieldErrors } from '@/lib/api-client';
import { email, passwordSchema, phone } from '@/lib/validation';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your name'),
  email,
  phone: phone.optional().or(z.literal('')),
  password: passwordSchema,
  marketingConsent: z.boolean().optional(),
  terms: z.literal(true, { errorMap: () => ({ message: 'Please accept the terms to continue' }) }),
});

export default function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState, setError: setFieldError } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ terms: _t, ...v }) => {
    setError('');
    try {
      await api('/auth/register', { method: 'POST', body: { ...v, phone: v.phone || undefined } });
      const next = params.get('next');
      router.push(`/account/verify?email=${encodeURIComponent(v.email)}${next ? `&next=${encodeURIComponent(next)}` : ''}`);
    } catch (err) {
      const fe = fieldErrors(err);
      Object.entries(fe).forEach(([k, m]) => setFieldError(k, { message: m }));
      if (!Object.keys(fe).length) setError(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <Field label="Full name" autoComplete="name" required {...register('name')} error={formState.errors.name?.message} />
      <Field label="Email" type="email" autoComplete="email" required {...register('email')} error={formState.errors.email?.message} />
      <Field label="Mobile number (optional)" type="tel" autoComplete="tel" {...register('phone')} error={formState.errors.phone?.message} />
      <Field label="Password" type="password" autoComplete="new-password" required hint="At least 10 characters with letters and numbers" {...register('password')} error={formState.errors.password?.message} />
      <label className="flex items-start gap-2 text-sm text-graphite">
        <input type="checkbox" className="mt-1 accent-signal" {...register('marketingConsent')} />
        Send me occasional emails about new gear and genuine offers (optional)
      </label>
      <div>
        <label className="flex items-start gap-2 text-sm text-graphite">
          <input type="checkbox" className="mt-1 accent-signal" {...register('terms')} aria-invalid={Boolean(formState.errors.terms)} />
          <span>
            I agree to the <Link href="/pages/terms-and-conditions" className="link">terms</Link> and <Link href="/pages/privacy-policy" className="link">privacy policy</Link>
          </span>
        </label>
        {formState.errors.terms ? <p className="field-error">{formState.errors.terms.message}</p> : null}
      </div>
      {error ? (
        <p className="rounded bg-signal-light p-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary w-full" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? 'Creating account…' : 'Create account'}
      </button>
      <p className="text-sm text-graphite">
        Already have an account? <Link href="/account/login" className="link">Sign in</Link>
      </p>
    </form>
  );
}
