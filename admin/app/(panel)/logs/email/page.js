'use client';

import Link from 'next/link';
import { useList, useUrlState } from '@/lib/hooks';
import { dateTime, humanize } from '@/lib/format';
import { PageHeader, DataTable, Pager, Tabs, Status, Notice } from '@/components/ui';
import Guard from '@/components/shell/Guard';

export default function EmailLogPage() {
  const [state, set] = useUrlState({});
  const list = useList('/email-logs', { ...state, limit: 50 });
  return (
    <Guard perm="orders:read">
      <PageHeader title="Email log" description="Every email the store has sent or tried to send. Failed emails are retried automatically a few times." />
      {list.items.some((e) => e.status === 'dev_outbox') ? (
        <div className="mb-4">
          <Notice tone="caution" title="Emails are not being delivered">SMTP is not configured, so emails are written to the development outbox only. Add SMTP settings to the API environment before launch.</Notice>
        </div>
      ) : null}
      <Tabs value={state.status || ''} onChange={(status) => set({ status })} tabs={[['', 'All'], ['sent', 'Sent'], ['failed', 'Failed'], ['queued', 'Queued'], ['dev_outbox', 'Not delivered (dev)']]} />
      <DataTable
        rows={list.items}
        isLoading={list.isLoading}
        error={list.error}
        columns={[
          { key: 'createdAt', label: 'When', render: (e) => <span className="whitespace-nowrap">{dateTime(e.createdAt)}</span> },
          { key: 'to', label: 'To' },
          { key: 'template', label: 'Email', render: (e) => humanize(e.template) },
          { key: 'subject', label: 'Subject', render: (e) => <span className="line-clamp-1 max-w-sm">{e.subject}</span> },
          { key: 'order', label: 'Order', render: (e) => (e.order ? <Link className="link" href={`/orders/${e.order}`}>Open</Link> : '—') },
          { key: 'attempts', label: 'Tries', align: 'right' },
          { key: 'status', label: 'Status', render: (e) => <><Status value={e.status === 'dev_outbox' ? 'queued' : e.status} label={e.status === 'dev_outbox' ? 'Dev outbox' : undefined} />{e.error ? <span className="block max-w-xs text-xs text-alert">{e.error}</span> : null}</> },
        ]}
        footer={<Pager meta={list.meta} onPage={(page) => set({ page })} />}
      />
    </Guard>
  );
}
