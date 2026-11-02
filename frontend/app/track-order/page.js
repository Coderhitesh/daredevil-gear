import { Suspense } from 'react';
import TrackForm from './TrackForm';
import PageHero from '@/components/layout/PageHero';

export const metadata = { title: 'Track your order', robots: { index: false } };

export default function TrackPage() {
  return (
    <>
      <PageHero compact crumbs={[{ name: 'Track order', href: '/track-order' }]} title="Track your order" subtitle="Enter your order number and the email you used at checkout." />
      <div className="wrap max-w-2xl pt-10">
        <div className="panel p-6 sm:p-8">
          <Suspense>
            <TrackForm />
          </Suspense>
        </div>
      </div>
    </>
  );
}
