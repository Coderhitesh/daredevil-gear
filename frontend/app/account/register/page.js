import { Suspense } from 'react';
import RegisterForm from './RegisterForm';
import AuthShell from '@/components/auth/AuthShell';

export const metadata = { title: 'Create an account', robots: { index: false } };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create an account"
      intro="We will email you a 6-digit code to verify your address."
      aside={<p className="font-display text-4xl font-semibold leading-tight">Faster checkout, saved addresses and order tracking.</p>}
    >
      <Suspense>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
