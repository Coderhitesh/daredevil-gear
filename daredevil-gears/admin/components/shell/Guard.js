'use client';

import { useCan } from '@/lib/hooks';
import { Empty } from '@/components/ui';

/** Hides a page body when the role lacks permission. The API enforces the same rule. */
export default function Guard({ perm, children }) {
  const can = useCan();
  if (perm && !can(perm)) {
    return <Empty title="You don't have access to this page">Ask a super admin to change your role if you need it.</Empty>;
  }
  return children;
}
