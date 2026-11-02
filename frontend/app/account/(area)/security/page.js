'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useUi } from '@/lib/store';
import { dateTime } from '@/lib/format';
import Field from '@/components/forms/Field';

export default function SecurityPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const notify = useUi((s) => s.notify);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [err, setErr] = useState('');
  const { data: sessions = [], refetch } = useQuery({ queryKey: ['sessions'], queryFn: () => api('/users/me/sessions') });

  const change = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api('/users/me/password', { method: 'POST', body: pw });
      notify('Password changed. Please sign in again.', 'good');
      qc.clear();
      router.replace('/account/login');
    } catch (error) {
      setErr(error.message);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <form onSubmit={change} className="panel space-y-4 p-5">
        <h2 className="font-display text-2xl">Change password</h2>
        <Field label="Current password" type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
        <Field label="New password" type="password" autoComplete="new-password" required hint="At least 10 characters with letters and numbers. You will be signed out everywhere." value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} error={err} />
        <button type="submit" className="btn-dark btn-sm" disabled={!pw.currentPassword || pw.newPassword.length < 10}>
          Change password
        </button>
      </form>

      <section className="panel p-5">
        <h2 className="font-display text-2xl">Where you are signed in</h2>
        <ul className="mt-3 divide-y divide-stone-300">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[15px]">
              <span>
                <span className="line-clamp-1">{s.userAgent || 'Unknown device'}</span>
                <span className="block text-sm text-graphite-400">
                  Last active {dateTime(s.lastUsedAt)}
                  {s.current ? ', this device' : ''}
                </span>
              </span>
              {!s.current ? (
                <button type="button" className="btn-ghost btn-sm" onClick={async () => (await api(`/users/me/sessions/${s.id}`, { method: 'DELETE' }), refetch())}>
                  Sign out
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn-outline btn-sm mt-4"
          onClick={async () => {
            await api('/auth/logout-all', { method: 'POST' });
            qc.clear();
            router.replace('/account/login');
          }}
        >
          Sign out of all devices
        </button>
      </section>
    </div>
  );
}
