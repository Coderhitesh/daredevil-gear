import AccountShell from './AccountShell';

export const metadata = { title: 'Your account', robots: { index: false } };

export default function AccountLayout({ children }) {
  return <AccountShell>{children}</AccountShell>;
}
