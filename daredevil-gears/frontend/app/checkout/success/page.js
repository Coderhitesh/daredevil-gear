import { Suspense } from 'react';
import SuccessView from './SuccessView';

export const metadata = { title: 'Order confirmed', robots: { index: false } };

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="wrap pt-16"><div className="skeleton h-48" /></div>}>
      <SuccessView />
    </Suspense>
  );
}
