import ForgotForm from './ForgotForm';
import AuthShell from '@/components/auth/AuthShell';

export const metadata = { title: 'Reset your password', robots: { index: false } };

export default function ForgotPage() {
  return (
    <AuthShell title="Reset your password" intro="Enter your account email. We will send a 6-digit code to set a new password." aside={<p className="font-display text-4xl font-semibold leading-tight">Back on the trail in a minute.</p>}>
      <ForgotForm />
    </AuthShell>
  );
}
