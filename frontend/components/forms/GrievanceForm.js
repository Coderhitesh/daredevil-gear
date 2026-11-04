'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Field from './Field';
import { api, fieldErrors } from '@/lib/api-client';
import { email, phone } from '@/lib/validation';
import { date } from '@/lib/format';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your name'),
  email,
  phone: phone.optional().or(z.literal('')),
  orderNumber: z.string().trim().max(20).optional(),
  category: z.enum(['order', 'payment', 'product', 'delivery', 'refund', 'privacy', 'other']),
  subject: z.string().trim().min(3, 'Add a short subject'),
  description: z.string().trim().min(20, 'Please describe the issue (at least 20 characters)'),
});

export default function GrievanceForm() {
  const [done, setDone] = useState(null);
  const [status, setStatus] = useState(null);
  const [lookup, setLookup] = useState({ ticketNumber: '', email: '' });
  const { register, handleSubmit, formState, setError } = useForm({ resolver: zodResolver(schema), defaultValues: { category: 'order' } });

  const submit = async (v) => {
    try {
      setDone(await api('/grievances', { method: 'POST', body: { ...v, phone: v.phone || undefined, orderNumber: v.orderNumber || undefined } }));
    } catch (err) {
      Object.entries(fieldErrors(err)).forEach(([k, m]) => setError(k, { message: m }));
      setError('root', { message: err.message });
    }
  };

  if (done) {
    return (
      <div className="panel mt-4 p-5" role="status">
        <p className="font-medium">Complaint {done.ticketNumber} registered.</p>
        <p className="mt-1 text-graphite">
          We will acknowledge it by {date(done.dueAcknowledgeBy, { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })} and aim to resolve it by {date(done.dueResolveBy)}. A confirmation has been emailed to you.
        </p>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit(submit)} noValidate className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required {...register('name')} error={formState.errors.name?.message} />
        <Field label="Email" type="email" required {...register('email')} error={formState.errors.email?.message} />
        <Field label="Phone (optional)" type="tel" {...register('phone')} error={formState.errors.phone?.message} />
        <Field label="Order number (if any)" {...register('orderNumber')} />
        <Field label="About" as="select" className="sm:col-span-2" {...register('category')}>
          <option value="order">An order</option>
          <option value="payment">A payment</option>
          <option value="product">A product</option>
          <option value="delivery">Delivery</option>
          <option value="refund">A refund</option>
          <option value="privacy">My personal data</option>
          <option value="other">Something else</option>
        </Field>
        <Field label="Subject" required className="sm:col-span-2" {...register('subject')} error={formState.errors.subject?.message} />
        <Field label="What happened?" as="textarea" required className="sm:col-span-2" {...register('description')} error={formState.errors.description?.message} />
        {formState.errors.root ? <p className="field-error sm:col-span-2">{formState.errors.root.message}</p> : null}
        <div className="sm:col-span-2">
          <button type="submit" className="btn-dark" disabled={formState.isSubmitting}>
            Submit complaint
          </button>
        </div>
      </form>

      <form
        className="panel mt-10 space-y-3 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setStatus(await api('/grievances/status', { method: 'POST', body: lookup }));
          } catch (err) {
            setStatus({ error: err.message });
          }
        }}
      >
        <h3 className="font-display text-xl">Check a complaint</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Ticket number" value={lookup.ticketNumber} onChange={(e) => setLookup({ ...lookup, ticketNumber: e.target.value })} />
          <Field label="Email" type="email" value={lookup.email} onChange={(e) => setLookup({ ...lookup, email: e.target.value })} />
          <button type="submit" className="btn-outline btn-sm h-11">
            Check
          </button>
        </div>
        {status ? (
          <p role="status" className="text-[15px]">
            {status.error ? <span className="text-alert">{status.error}</span> : <>{status.ticketNumber}: <span className="capitalize">{status.status.replace(/_/g, ' ')}</span>{status.resolution ? `. ${status.resolution}` : ''}</>}
          </p>
        ) : null}
      </form>
    </>
  );
}
