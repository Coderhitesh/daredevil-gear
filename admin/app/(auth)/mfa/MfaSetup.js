'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { api } from '@/lib/api';
import { safeNext } from '@/lib/next';
import { Input, Spinner } from '@/components/ui';

export default function MfaSetup() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [setup, setSetup] = useState(null);
  const [qr, setQr] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Each call issues a new pending secret, so request exactly once (Strict Mode runs effects twice in dev).
    if (started.current) return;
    started.current = true;
    api('/auth/mfa/setup', { method: 'POST' })
      .then(async (s) => {
        setSetup(s);
        setQr(await QRCode.toDataURL(s.otpauthUrl, { margin: 1, width: 220, color: { dark: '#151716', light: '#ffffff' } }));
      })
      .catch((err) => {
        if (err.status === 409) router.replace(safeNext(params.get('next')));
        else if (err.status !== 401) setError(err.message);
      });
  }, [router, params]);

  async function confirm(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api('/auth/mfa/confirm', { method: 'POST', body: { code: code.trim() } });
      qc.setQueryData(['admin-me'], user);
      router.replace(safeNext(params.get('next')));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={confirm} className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Set up two-factor sign-in</h1>
        <p className="mt-1 text-sm text-graphite-400">Admin accounts need an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy). You will enter a code from it each time you sign in.</p>
      </div>
      {error ? (
        <p role="alert" className="rounded border border-alert/30 bg-alert-light px-3 py-2 text-sm text-alert">
          {error}
        </p>
      ) : null}
      {setup ? (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-graphite">
            <li>Scan this code with your authenticator app.</li>
            <li>Enter the 6-digit code it shows.</li>
          </ol>
          <div className="flex justify-center">{qr ? <img src={qr} alt="QR code for your authenticator app" width={220} height={220} /> : <div className="skeleton h-[220px] w-[220px]" />}</div>
          <details className="text-sm">
            <summary className="cursor-pointer text-graphite-600">Can&apos;t scan? Enter the key manually</summary>
            <code className="mt-2 block break-all rounded bg-stone-200 px-2 py-1.5 text-xs">{setup.secret}</code>
          </details>
          <Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
          <button type="submit" className="btn-primary w-full py-2.5" disabled={busy || code.length !== 6}>
            {busy ? <Spinner /> : null}
            Turn on two-factor
          </button>
        </>
      ) : !error ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      ) : null}
    </form>
  );
}
