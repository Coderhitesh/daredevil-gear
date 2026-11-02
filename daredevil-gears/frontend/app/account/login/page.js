import { Suspense } from 'react';
import LoginForm from './LoginForm';
import AuthShell from '@/components/auth/AuthShell';

export const metadata = { title: 'Sign in', robots: { index: false } };

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in"
      intro="Track orders, save addresses and keep your wishlist across devices."
      aside={
        <>
          <p className="font-display text-4xl font-semibold leading-tight">Your orders, addresses and wishlist in one place.</p>
          <p className="mt-3 text-stone-300">Your cart comes with you when you sign in.</p>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
