import { Suspense } from 'react';
import VerifyForm from './VerifyForm';
import AuthShell from '@/components/auth/AuthShell';

export const metadata = { title: 'Verify your email', robots: { index: false } };

export default function VerifyPage() {
  return (
    <AuthShell title="Check your email" aside={<p className="font-display text-4xl font-semibold leading-tight">One quick step to keep your account secure.</p>}>
      <Suspense>
        <VerifyForm />
      </Suspense>
    </AuthShell>
  );
}
