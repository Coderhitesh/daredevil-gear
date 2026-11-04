'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Flag } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useMe } from '@/lib/hooks';
import { useUi } from '@/lib/store';
import { date } from '@/lib/format';
import Stars from './Stars';

function ReviewForm({ productId, onDone }) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!rating) return setError('Choose a star rating');
    setBusy(true);
    setError('');
    try {
      await api('/reviews', { method: 'POST', body: { productId, rating, title: title || undefined, body } });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return null;
  };
  return (
    <form onSubmit={submit} className="panel space-y-4 p-5">
      <fieldset>
        <legend className="field-label">Your rating</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input type="radio" name="rating" value={n} className="peer sr-only" checked={rating === n} onChange={() => setRating(n)} />
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded border text-lg peer-focus-visible:ring-2 peer-focus-visible:ring-signal ${n <= rating ? 'border-signal bg-signal text-white' : 'border-stone-400 bg-white'}`} aria-label={`${n} star${n > 1 ? 's' : ''}`}>
                {n}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="field-label" htmlFor="rv-title">Title (optional)</label>
        <input id="rv-title" className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="field-label" htmlFor="rv-body">Your review</label>
        <textarea id="rv-body" className="input min-h-[120px]" minLength={10} maxLength={4000} required value={body} onChange={(e) => setBody(e.target.value)} placeholder="How did it perform? What would you tell another buyer?" />
      </div>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <button type="submit" className="btn-dark" disabled={busy}>
        Submit review
      </button>
      <p className="text-sm text-graphite-400">Reviews are checked before they appear. Only customers who received this product can review it.</p>
    </form>
  );
}

export default function Reviews({ slug, productId }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const notify = useUi((s) => s.notify);
  const [page, setPage] = useState(1);
  const [writing, setWriting] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['reviews', slug, page], queryFn: () => api(`/products/${slug}/reviews?page=${page}&limit=6`) });
  const { data: elig } = useQuery({ queryKey: ['review-elig', slug, me?.id], enabled: Boolean(me), queryFn: () => api(`/products/${slug}/review-eligibility`) });

  const reviews = data?.data;
  const summary = reviews?.summary;
  return (
    <section id="reviews" className="wrap mt-16 scroll-mt-32 border-t border-stone-300 pt-12">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div>
          <h2 className="font-display text-display-md">Customer reviews</h2>
          {summary?.count ? (
            <div className="mt-4">
              <p className="flex items-center gap-3">
                <span className="tabular font-display text-4xl font-semibold">{summary.average}</span>
                <span>
                  <Stars value={summary.average} />
                  <span className="block text-sm text-graphite">{summary.count} verified review{summary.count > 1 ? 's' : ''}</span>
                </span>
              </p>
              <ul className="mt-4 space-y-1.5">
                {summary.distribution.map((d) => (
                  <li key={d.star} className="flex items-center gap-3 text-sm">
                    <span className="tabular w-10">{d.star} star</span>
                    <span className="h-2 flex-1 overflow-hidden rounded bg-stone-300">
                      <span className="block h-full bg-signal" style={{ width: `${(d.count / summary.count) * 100}%` }} />
                    </span>
                    <span className="tabular w-6 text-right text-graphite">{d.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-graphite">No reviews yet. Reviews come only from customers who have received this product.</p>
          )}
          <div className="mt-6">
            {!me ? (
              <p className="text-sm text-graphite">
                <Link href={`/account/login?next=/product/${slug}%23reviews`} className="link">Sign in</Link> to review a product you have bought.
              </p>
            ) : elig?.canReview ? (
              !writing && (
                <button type="button" className="btn-outline" onClick={() => setWriting(true)}>
                  Write a review
                </button>
              )
            ) : elig?.reason === 'already_reviewed' ? (
              <p className="text-sm text-graphite">Thanks — you have reviewed this product{elig.status === 'pending' ? ' (awaiting moderation)' : ''}.</p>
            ) : elig?.reason === 'purchase_required' ? (
              <p className="text-sm text-graphite">You can review this product after it has been delivered to you.</p>
            ) : null}
          </div>
        </div>
        <div>
          {writing ? (
            <div className="mb-8">
              <ReviewForm
                productId={productId}
                onDone={() => {
                  setWriting(false);
                  notify('Thanks! Your review will appear once it has been checked.', 'good');
                  qc.invalidateQueries({ queryKey: ['review-elig', slug] });
                }}
              />
            </div>
          ) : null}
          {isLoading ? (
            <div className="space-y-4">
              <div className="skeleton h-24" />
              <div className="skeleton h-24" />
            </div>
          ) : reviews?.items?.length ? (
            <ul className="divide-y divide-stone-300">
              {reviews.items.map((r) => (
                <li key={r.id} className="py-6 first:pt-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Stars value={r.rating} size={14} />
                    {r.title ? <p className="font-medium">{r.title}</p> : null}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-graphite">{r.body}</p>
                  <p className="mt-3 flex flex-wrap items-center gap-x-3 text-sm text-graphite-400">
                    <span>{r.author}</span>
                    {r.verifiedPurchase ? (
                      <span className="inline-flex items-center gap-1 text-okay">
                        <BadgeCheck size={14} /> Verified purchase
                      </span>
                    ) : null}
                    <span>{date(r.createdAt)}</span>
                    {me ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-ink"
                        onClick={async () => {
                          const reason = window.prompt('Why are you reporting this review?');
                          if (!reason) return;
                          try {
                            await api(`/reviews/${r.id}/report`, { method: 'POST', body: { reason } });
                            notify('Thanks, our team will take a look.', 'good');
                          } catch (err) {
                            notify(err.message, 'bad');
                          }
                        }}
                      >
                        <Flag size={13} /> Report
                      </button>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          {data?.meta?.totalPages > 1 ? (
            <div className="mt-6 flex gap-2">
              <button type="button" className="btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Newer
              </button>
              <button type="button" className="btn-outline btn-sm" disabled={page >= data.meta.totalPages} onClick={() => setPage(page + 1)}>
                Older
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
