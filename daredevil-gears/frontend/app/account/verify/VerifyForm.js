'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import OtpInput from '@/components/auth/OtpInput';
import { api } from '@/lib/api-client';
import { useAfterSignIn } from '@/lib/auth';

export default function VerifyForm() {
  const params = useSearchParams();
  const email = params.get('email') || '';
  const after = useAfterSignIn();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState({ busy: false, error: '', info: '' });
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e, value = code) => {
    e?.preventDefault();
    if (value.length !== 6 || status.busy) return;
    setStatus({ busy: true, error: '', info: '' });
    try {
      const res = await api('/auth/verify-email', { method: 'POST', body: { email, code: value } });
      await after(res.user);
    } catch (err) {
      setStatus({ busy: false, error: err.message, info: '' });
      setCode('');
    }
  };

  const resend = async () => {
    setStatus({ busy: false, error: '', info: '' });
    try {
      await api('/auth/resend-otp', { method: 'POST', body: { email } });
      setStatus({ busy: false, error: '', info: 'A new code is on its way. Earlier codes no longer work.' });
      setCooldown(60);
    } catch (err) {
      setStatus({ busy: false, error: err.message, info: '' });
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <p className="text-graphite">
        Enter the 6-digit code we sent to <strong className="text-ink">{email || 'your email'}</strong>. It expires in 10 minutes.
      </p>
      <OtpInput value={code} onChange={(v) => (setCode(v), v.length === 6 && submit(null, v))} disabled={status.busy} error={status.error} />
      <div aria-live="polite">
        {status.error ? <p className="field-error">{status.error}</p> : null}
        {status.info ? <p className="text-sm text-okay">{status.info}</p> : null}
      </div>
      <button type="submit" className="btn-primary w-full" disabled={status.busy || code.length !== 6}>
        {status.busy ? 'Verifying…' : 'Verify email'}
      </button>
      <p className="text-sm text-graphite">
        Did not get it? Check spam, or{' '}
        <button type="button" className="link disabled:no-underline disabled:opacity-60" onClick={resend} disabled={cooldown > 0}>
          send a new code{cooldown > 0 ? ` in ${cooldown}s` : ''}
        </button>
        .
      </p>
    </form>
  );
}
