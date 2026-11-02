'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { useUi } from '@/lib/store';

export default function PrivacyPage() {
  const notify = useUi((s) => s.notify);
  const [type, setType] = useState('correction');
  const [note, setNote] = useState('');

  const download = async () => {
    const res = await api('/users/me/export', { raw: true });
    if (!res.ok) return notify('Could not prepare your data. Please try again.', 'bad');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'daredevil-gears-my-data.json';
    a.click();
    URL.revokeObjectURL(url);
    return null;
  };

  const request = async (e) => {
    e.preventDefault();
    try {
      const res = await api('/users/me/privacy-requests', { method: 'POST', body: { type, note: note || undefined } });
      notify(res.message, 'good');
      setNote('');
    } catch (err) {
      notify(err.message, 'bad');
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <section className="panel p-5">
        <h2 className="font-display text-2xl">Download your data</h2>
        <p className="mt-2 text-graphite">A copy of your profile, addresses, orders and reviews as a JSON file.</p>
        <button type="button" className="btn-outline btn-sm mt-4" onClick={download}>
          Download my data
        </button>
      </section>
      <form onSubmit={request} className="panel space-y-4 p-5">
        <h2 className="font-display text-2xl">Make a privacy request</h2>
        <p className="text-graphite">
          Under the Digital Personal Data Protection Act 2023 you can ask us to correct or erase your data, or withdraw consent. We respond within 30 days. Order and invoice records are kept as required by tax law. See our <Link href="/pages/privacy-policy" className="link">privacy policy</Link>.
        </p>
        <label className="field-label" htmlFor="ptype">
          Request
        </label>
        <select id="ptype" className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="correction">Correct my data</option>
          <option value="erasure">Delete my account and data</option>
          <option value="withdraw_consent">Withdraw consent for marketing</option>
          <option value="export">Send me a copy of my data</option>
        </select>
        <label className="field-label" htmlFor="pnote">
          Details (optional)
        </label>
        <textarea id="pnote" className="input min-h-[90px]" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="submit" className="btn-dark btn-sm">
          Submit request
        </button>
      </form>
    </div>
  );
}
