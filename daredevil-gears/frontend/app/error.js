'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="wrap flex flex-col items-start gap-5 pt-20">
      <h1 className="font-display text-display-md">Something went wrong loading this page</h1>
      <p className="max-w-prose text-graphite">Your cart and account are safe. Try again, or come back in a few minutes.</p>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="btn-dark">
          Try again
        </button>
        <Link href="/" className="btn-outline">
          Go to home page
        </Link>
      </div>
    </div>
  );
}
