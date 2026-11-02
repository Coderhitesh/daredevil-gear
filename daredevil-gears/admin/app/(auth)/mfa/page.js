import { Suspense } from 'react';
import MfaSetup from './MfaSetup';

export const metadata = { title: 'Set up two-factor' };

export default function MfaPage() {
  return (
    <Suspense>
      <MfaSetup />
    </Suspense>
  );
}
