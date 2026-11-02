'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import OtpInput from '@/components/auth/OtpInput';
import Field from '@/components/forms/Field';
import { api } from '@/lib/api-client';

export default function ForgotForm() {
  const router = useRouter();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState({ busy: false, error: '', info: '' });

  const request = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: '', info: '' });
    try {
      const res = await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setState({ busy: false, error: '', info: res.message });
      setStep('reset');
    } catch (err) {
      setState({ busy: false, error: err.message, info: '' });
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: '', info: '' });
    try {
      await api('/auth/reset-password', { method: 'POST', body: { email, code, password } });
      router.push('/account/login?reset=1');
    } catch (err) {
      setState({ busy: false, error: err.message, info: '' });
    }
  };

  if (step === 'email') {
    return (
      <form onSubmit={request} className="space-y-5">
        <Field label="Email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={state.error} />
        <button type="submit" className="btn-primary w-full" disabled={state.busy || !email}>
          Send code
        </button>
        <Link href="/account/login" className="link text-sm">
          Back to sign in
        </Link>
      </form>
    );
  }
  return (
    <form onSubmit={reset} className="space-y-5">
      <p className="text-sm text-graphite">{state.info || `If ${email} has an account, a code is on its way.`}</p>
      <div>
        <p className="field-label">6-digit code</p>
        <OtpInput value={code} onChange={setCode} />
      </div>
      <Field label="New password" type="password" required autoComplete="new-password" hint="At least 10 characters with letters and numbers" value={password} onChange={(e) => setPassword(e.target.value)} />
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary w-full" disabled={state.busy || code.length !== 6 || password.length < 10}>
        Set new password
      </button>
      <button type="button" className="link text-sm" onClick={() => setStep('email')}>
        Use a different email
      </button>
    </form>
  );
}
