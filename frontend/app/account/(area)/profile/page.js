'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useMe } from '@/lib/hooks';
import { useUi } from '@/lib/store';
import { phone } from '@/lib/validation';
import Field from '@/components/forms/Field';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your name'),
  phone: phone.optional().or(z.literal('')),
  notificationPrefs: z.object({ orderUpdates: z.boolean(), marketing: z.boolean(), whatsapp: z.boolean() }),
});

export default function ProfilePage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const notify = useUi((s) => s.notify);
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(schema),
    values: me ? { name: me.name, phone: me.phone || '', notificationPrefs: { orderUpdates: me.notificationPrefs?.orderUpdates ?? true, marketing: Boolean(me.notificationPrefs?.marketing), whatsapp: Boolean(me.notificationPrefs?.whatsapp) } } : undefined,
  });
  const submit = async (v) => {
    try {
      const user = await api('/users/me', { method: 'PATCH', body: v });
      qc.setQueryData(['me'], user);
      notify('Profile updated', 'good');
    } catch (err) {
      notify(err.message, 'bad');
    }
  };
  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="panel max-w-xl space-y-5 p-5">
      <Field label="Full name" required autoComplete="name" {...register('name')} error={formState.errors.name?.message} />
      <div>
        <p className="field-label">Email</p>
        <p className="text-graphite">{me?.email}</p>
        <p className="field-hint">To change your email, contact support — it is your sign-in and order address.</p>
      </div>
      <Field label="Mobile number" type="tel" autoComplete="tel" {...register('phone')} error={formState.errors.phone?.message} />
      <fieldset className="space-y-2">
        <legend className="field-label">Email preferences</legend>
        <label className="flex items-start gap-2 text-[15px]">
          <input type="checkbox" className="mt-1 accent-signal" {...register('notificationPrefs.orderUpdates')} />
          Order and delivery updates (recommended)
        </label>
        <label className="flex items-start gap-2 text-[15px]">
          <input type="checkbox" className="mt-1 accent-signal" {...register('notificationPrefs.marketing')} />
          New products and genuine offers
        </label>
        <label className="flex items-start gap-2 text-[15px]">
          <input type="checkbox" className="mt-1 accent-signal" {...register('notificationPrefs.whatsapp')} />
          WhatsApp messages about my orders
        </label>
      </fieldset>
      <button type="submit" className="btn-dark" disabled={formState.isSubmitting}>
        Save changes
      </button>
    </form>
  );
}
