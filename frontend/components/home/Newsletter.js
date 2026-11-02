'use client';

import { useId, useState } from 'react';
import { api } from '@/lib/api-client';

/** Newsletter sign-up with explicit consent. variant: 'band' (dark footer band) | 'light'. */
export default function Newsletter({ variant = 'light', source = 'home' }) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState({ status: 'idle', message: '' });
  const dark = variant === 'band';

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'loading', message: '' });
    try {
      const res = await api('/newsletter/subscribe', { method: 'POST', body: { email, consent: true, source } });
      setState({ status: 'done', message: res.message });
      setEmail('');
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  return (
    <form onSubmit={submit} className="w-full" noValidate>
      <div className={`flex overflow-hidden rounded-xl ${dark ? 'bg-white p-1' : 'border border-stone-300 bg-white p-1'}`}>
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <input id={`${id}-email`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email address" className="min-w-0 flex-1 bg-transparent px-3 text-[14.5px] text-ink placeholder:text-graphite-400 focus:outline-none" />
        <button type="submit" className="btn-primary btn-sm shrink-0 shadow-none" disabled={state.status === 'loading' || !consent || !email}>
          Subscribe
        </button>
      </div>
      <label className={`mt-2.5 flex items-start gap-2 text-[12.5px] ${dark ? 'text-stone-300' : 'text-graphite'}`}>
        <input type="checkbox" className="mt-0.5 accent-signal" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        I agree to receive occasional emails from DareDevil Gears. Unsubscribe any time.
      </label>
      <p role="status" className={`mt-1 text-sm ${state.status === 'error' ? 'text-signal' : dark ? 'text-stone-100' : 'text-okay'}`}>
        {state.message}
      </p>
    </form>
  );
}
