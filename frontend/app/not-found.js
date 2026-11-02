import Link from 'next/link';

export const metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return (
    <div className="wrap flex flex-col items-start gap-5 pt-20">
      <p className="tabular font-display text-[7rem] font-bold leading-none text-stone-400">404</p>
      <h1 className="font-display text-display-md">This trail does not go anywhere</h1>
      <p className="max-w-prose text-graphite">The page may have moved or the product may no longer be available. Search the shop or start from a category.</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/shop" className="btn-dark">
          Browse the shop
        </Link>
        <Link href="/" className="btn-outline">
          Home
        </Link>
      </div>
    </div>
  );
}
