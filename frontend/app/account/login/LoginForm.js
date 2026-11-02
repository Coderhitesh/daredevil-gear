'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Field from '@/components/forms/Field';
import { api } from '@/lib/api-client';
import { useAfterSignIn } from '@/lib/auth';
import { email } from '@/lib/validation';

const schema = z.object({ email, password: z.string().min(1, 'Enter your password') });

export default function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const after = useAfterSignIn();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(schema) });
  const next = params.get('next') || '';

  const onSubmit = async (v) => {
    setError('');
    try {
      const res = await api('/auth/login', { method: 'POST', body: v });
      await after(res.user);
    } catch (err) {
      if (err.code === 'EMAIL_NOT_VERIFIED') {
        router.push(`/account/verify?email=${encodeURIComponent(v.email)}${next ? `&next=${encodeURIComponent(next)}` : ''}`);
        return;
      }
      setError(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <Field label="Email" type="email" autoComplete="email" required {...register('email')} error={formState.errors.email?.message} />
      <Field label="Password" type="password" autoComplete="current-password" required {...register('password')} error={formState.errors.password?.message} />
      {error ? (
        <p className="rounded bg-signal-light p-3 text-sm text-ink" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary w-full" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/account/forgot-password" className="link">
          Forgot password?
        </Link>
        <span className="text-graphite">
          New here? <Link href={`/account/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="link">Create an account</Link>
        </span>
      </div>
    </form>
  );
}
