'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { api, fieldErrors } from '@/lib/api-client';
import { addressSchema, clean } from '@/lib/validation';
import AddressFields from '@/components/forms/AddressFields';
import Field from '@/components/forms/Field';
import { useUi } from '@/lib/store';

function AddressForm({ initial, onDone, onCancel }) {
  const notify = useUi((s) => s.notify);
  const { register, handleSubmit, formState, setError } = useForm({ resolver: zodResolver(addressSchema), defaultValues: initial || { country: 'IN' } });
  const submit = async (v) => {
    try {
      if (initial?._id) await api(`/addresses/${initial._id}`, { method: 'PATCH', body: clean(v) });
      else await api('/addresses', { method: 'POST', body: clean(v) });
      notify('Address saved', 'good');
      onDone();
    } catch (err) {
      Object.entries(fieldErrors(err)).forEach(([k, m]) => setError(k, { message: m }));
      notify(err.message, 'bad');
    }
  };
  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="panel space-y-5 p-5">
      <Field label="Label (optional)" placeholder="Home, Office…" {...register('label')} />
      <AddressFields register={register} errors={formState.errors} showBusiness />
      <div className="flex gap-3">
        <button type="submit" className="btn-dark btn-sm" disabled={formState.isSubmitting}>
          Save address
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function AddressesPage() {
  const qc = useQueryClient();
  const notify = useUi((s) => s.notify);
  const { data: addresses = [], isLoading } = useQuery({ queryKey: ['addresses'], queryFn: () => api('/addresses') });
  const [editing, setEditing] = useState(null); // null | 'new' | address
  const done = () => {
    setEditing(null);
    qc.invalidateQueries({ queryKey: ['addresses'] });
  };

  if (isLoading) return <div className="skeleton h-48" />;
  return (
    <div className="space-y-4">
      {editing ? <AddressForm initial={editing === 'new' ? null : editing} onDone={done} onCancel={() => setEditing(null)} /> : (
        <button type="button" className="btn-dark btn-sm" onClick={() => setEditing('new')}>
          Add an address
        </button>
      )}
      {!addresses.length && !editing ? (
        <div className="panel flex items-center gap-3 p-6 text-graphite">
          <MapPin size={20} /> No saved addresses yet. Add one to check out faster.
        </div>
      ) : null}
      <ul className="grid gap-4 md:grid-cols-2">
        {addresses.map((a) => (
          <li key={a._id} className="panel p-5">
            <p className="font-medium">
              {a.fullName} {a.label ? <span className="tag-muted ml-1">{a.label}</span> : null}
              {a.isDefaultShipping ? <span className="tag-olive ml-1">Default</span> : null}
            </p>
            <p className="mt-1 text-[15px] text-graphite">
              {a.line1}
              {a.line2 ? `, ${a.line2}` : ''}
              <br />
              {a.city}, {a.state} {a.pincode}
              <br />
              {a.phone}
              {a.gstin ? (
                <>
                  <br />
                  GSTIN {a.gstin}
                </>
              ) : null}
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <button type="button" className="link" onClick={() => setEditing(a)}>
                Edit
              </button>
              {!a.isDefaultShipping ? (
                <button type="button" className="link" onClick={async () => (await api(`/addresses/${a._id}`, { method: 'PATCH', body: { isDefaultShipping: true, isDefaultBilling: true } }), done())}>
                  Make default
                </button>
              ) : null}
              <button
                type="button"
                className="link text-alert"
                onClick={async () => {
                  if (!window.confirm('Delete this address?')) return;
                  await api(`/addresses/${a._id}`, { method: 'DELETE' });
                  notify('Address deleted', 'good');
                  done();
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
