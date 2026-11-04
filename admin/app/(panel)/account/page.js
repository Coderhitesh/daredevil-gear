'use client';

import { useForm } from 'react-hook-form';
import { api, applyFieldErrors } from '@/lib/api';
import { useAction, useAdmin } from '@/lib/hooks';
import { humanize } from '@/lib/format';
import { PageHeader, Card, Input, KeyValue, Spinner, Pill } from '@/components/ui';

export default function AccountPage() {
  const { data: me } = useAdmin();
  const form = useForm({ defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });
  const save = useAction((v) => api('/auth/password', { method: 'POST', body: { currentPassword: v.currentPassword, newPassword: v.newPassword } }), {
    success: 'Password changed. Other sessions were signed out.',
    onSuccess: () => form.reset(),
    onError: (err) => {
      if (err.status === 400) form.setError('currentPassword', { message: err.message });
      else if (err.status === 422) form.setError('newPassword', { message: err.message });
      return applyFieldErrors(err, form.setError);
    },
  });
  const submit = (v) => {
    if (v.newPassword !== v.confirm) return form.setError('confirm', { message: 'Passwords do not match' });
    return save.mutate(v);
  };
  const e = form.formState.errors;

  return (
    <>
      <PageHeader title="My account" />
      <div className="grid grid-cols-1 max-w-4xl gap-4 md:grid-cols-2">
        <Card title="Profile">
          {me ? <KeyValue rows={[['Name', me.name], ['Email', me.email], ['Role', humanize(me.role)], ['Two-factor', !me.mfaEnabled ? <Pill key="m" tone="caution">Off</Pill> : <Pill key="m" tone="okay">On</Pill>]]} /> : null}
          <p className="mt-4 text-xs text-graphite-400">To change your name, email or role, ask a super admin. Lost your authenticator? A super admin can reset it after confirming who you are.</p>
        </Card>
        <Card title="Change password">
          <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4">
            <Input label="Current password" type="password" autoComplete="current-password" required error={e.currentPassword?.message} {...form.register('currentPassword', { required: 'Enter your current password' })} />
            <Input label="New password" type="password" autoComplete="new-password" required hint="At least 12 characters. Use a passphrase from a password manager." error={e.newPassword?.message} {...form.register('newPassword', { required: 'Enter a new password', minLength: { value: 12, message: 'At least 12 characters' } })} />
            <Input label="Confirm new password" type="password" autoComplete="new-password" required error={e.confirm?.message} {...form.register('confirm', { required: 'Repeat the new password' })} />
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null} Change password
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
