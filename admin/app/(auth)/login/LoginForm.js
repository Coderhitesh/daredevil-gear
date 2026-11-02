'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { safeNext } from '@/lib/next';
import { Input, Spinner } from '@/components/ui';

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [needCode, setNeedCode] = useState(false);
  const [error, setError] = useState(null);
  const { register, handleSubmit, formState, setFocus } = useForm({ defaultValues: { email: '', password: '', totp: '' } });

  async function onSubmit(v) {
    setError(null);
    try {
      const { user } = await api('/auth/login', { method: 'POST', body: { email: v.email.trim(), password: v.password, ...(needCode && v.totp ? { totp: v.totp.trim() } : {}) } });
      qc.setQueryData(['admin-me'], user);
      const next = safeNext(params.get('next'));
      router.replace(user.mfaSetupRequired ? `/mfa?next=${encodeURIComponent(next)}` : next);
    } catch (err) {
      if (err.code === 'MFA_REQUIRED') {
        setNeedCode(true);
        setTimeout(() => setFocus('totp'), 0);
        return;
      }
      setError(err.message);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Sign in to admin</h1>
        <p className="mt-1 text-sm text-graphite-400">{needCode ? 'Enter the 6-digit code from your authenticator app.' : 'Use the email and password issued to you.'}</p>
      </div>
      {error ? (
        <p role="alert" className="rounded border border-alert/30 bg-alert-light px-3 py-2 text-sm text-alert">
          {error}
        </p>
      ) : null}
      <div className={needCode ? 'hidden' : 'space-y-4'}>
        <Input label="Email" type="email" autoComplete="username" required {...register('email', { required: true })} />
        <Input label="Password" type="password" autoComplete="current-password" required {...register('password', { required: true })} />
      </div>
      {needCode ? <Input label="Authenticator code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required {...register('totp', { required: true, pattern: /^\d{6}$/ })} /> : null}
      <button type="submit" className="btn-primary w-full py-2.5" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? <Spinner /> : null}
        {needCode ? 'Verify and sign in' : 'Sign in'}
      </button>
      {needCode ? (
        <button type="button" className="btn-ghost w-full" onClick={() => setNeedCode(false)}>
          Use a different account
        </button>
      ) : null}
      <p className="text-xs text-graphite-400">Forgot your password or lost your authenticator? Ask a super admin to reset it. There is no self-service reset for admin accounts.</p>
    </form>
  );
}
