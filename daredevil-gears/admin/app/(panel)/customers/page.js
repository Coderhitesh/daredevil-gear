'use client';

import { useRouter } from 'next/navigation';
import { useList, useUrlState } from '@/lib/hooks';
import { inr, date, ago } from '@/lib/format';
import { PageHeader, DataTable, Pager, Toolbar, SearchInput, FilterSelect, Status, Pill } from '@/components/ui';
import Guard from '@/components/shell/Guard';

export default function CustomersPage() {
  const router = useRouter();
  const [state, set] = useUrlState({});
  const list = useList('/customers', { ...state, limit: 50 });
  return (
    <Guard perm="customers:read">
      <PageHeader title="Customers" description="Registered customer accounts. Guest orders are listed under Orders. Spend counts paid orders only." />
      <Toolbar>
        <SearchInput value={state.q} onChange={(q) => set({ q })} placeholder="Name, email or phone" />
        <FilterSelect label="Status" value={state.status} onChange={(status) => set({ status })} options={['active', 'pending_verification', 'suspended', 'deleted']} />
      </Toolbar>
      <DataTable
        rows={list.items}
        isLoading={list.isLoading}
        error={list.error}
        onRowClick={(c) => router.push(`/customers/${c.id}`)}
        columns={[
          {
            key: 'name',
            label: 'Customer',
            render: (c) => (
              <>
                <span className="font-medium">{c.name}</span>
                <span className="block text-xs text-graphite-400">{c.email}</span>
              </>
            ),
          },
          { key: 'phone', label: 'Phone', render: (c) => c.phone || '—' },
          { key: 'verified', label: 'Email', render: (c) => (c.emailVerified ? <Pill tone="okay">Verified</Pill> : <Pill tone="caution">Unverified</Pill>) },
          { key: 'orders', label: 'Paid orders', align: 'right' },
          { key: 'spent', label: 'Spent', align: 'right', render: (c) => inr(c.spent, { decimals: 0 }) },
          { key: 'createdAt', label: 'Joined', render: (c) => date(c.createdAt) },
          { key: 'lastLoginAt', label: 'Last sign-in', render: (c) => ago(c.lastLoginAt) },
          { key: 'status', label: 'Status', render: (c) => <Status value={c.status} /> },
        ]}
        footer={<Pager meta={list.meta} onPage={(page) => set({ page })} />}
      />
    </Guard>
  );
}
