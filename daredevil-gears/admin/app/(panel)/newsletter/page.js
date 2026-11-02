'use client';

import { Download } from 'lucide-react';
import { download } from '@/lib/api';
import { useCan, useList, useUrlState } from '@/lib/hooks';
import { dateTime, humanize } from '@/lib/format';
import { PageHeader, DataTable, Pager, Tabs, Status } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import Guard from '@/components/shell/Guard';

export default function NewsletterPage() {
  const can = useCan();
  const toast = useToast();
  const [state, set] = useUrlState({});
  const list = useList('/newsletter', { ...state, limit: 100 });
  return (
    <Guard perm="content:write">
      <PageHeader
        title="Newsletter"
        description="People who gave consent when subscribing. Only email people who are subscribed; every email carries an unsubscribe link that takes effect immediately."
        actions={
          can('customers:export') ? (
            <button type="button" className="btn-outline" onClick={() => download('/newsletter/export', 'newsletter.csv').catch((e) => toast.show(e.message, 'error'))}>
              <Download className="h-4 w-4" /> Export subscribed
            </button>
          ) : null
        }
      />
      <Tabs value={state.status || ''} onChange={(status) => set({ status })} tabs={[['', 'All'], ['subscribed', 'Subscribed'], ['unsubscribed', 'Unsubscribed']]} />
      <DataTable
        rows={list.items}
        isLoading={list.isLoading}
        error={list.error}
        columns={[
          { key: 'email', label: 'Email' },
          { key: 'source', label: 'Signed up from', render: (s) => humanize(s.source || '—') },
          { key: 'consentAt', label: 'Consent', render: (s) => dateTime(s.consentAt) },
          { key: 'createdAt', label: 'Created', render: (s) => dateTime(s.createdAt) },
          { key: 'status', label: 'Status', render: (s) => <Status value={s.status} /> },
        ]}
        footer={<Pager meta={list.meta} onPage={(page) => set({ page })} />}
      />
    </Guard>
  );
}
