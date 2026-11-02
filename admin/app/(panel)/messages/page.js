'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAction, useCan, useList, useUrlState } from '@/lib/hooks';
import { dateTime } from '@/lib/format';
import { PageHeader, DataTable, Pager, Tabs, Toolbar, FilterSelect, Status, Pill, Drawer, KeyValue } from '@/components/ui';
import Guard from '@/components/shell/Guard';

export default function MessagesPage() {
  const can = useCan();
  const [state, set] = useUrlState({});
  const list = useList('/messages', { ...state, limit: 50 });
  const [open, setOpen] = useState(null);
  const update = useAction(({ id, status }) => api(`/messages/${id}`, { method: 'PATCH', body: { status } }), { invalidate: ['/messages'], success: 'Message updated', onSuccess: () => setOpen(null) });

  return (
    <Guard perm="grievances:read">
      <PageHeader title="Messages & bulk enquiries" description="Contact-form messages and bulk or institutional order requests. Reply by email; mark them closed when done." />
      <Tabs value={state.type || ''} onChange={(type) => set({ type })} tabs={[['', 'All'], ['contact', 'Contact'], ['bulk_order', 'Bulk orders']]} />
      <Toolbar>
        <FilterSelect label="Status" value={state.status} onChange={(status) => set({ status })} options={['new', 'in_progress', 'closed']} />
      </Toolbar>
      <DataTable
        rows={list.items}
        isLoading={list.isLoading}
        error={list.error}
        onRowClick={setOpen}
        columns={[
          { key: 'createdAt', label: 'Received', render: (m) => <span className="whitespace-nowrap">{dateTime(m.createdAt)}</span> },
          { key: 'type', label: 'Type', render: (m) => (m.type === 'bulk_order' ? <Pill tone="signal">Bulk</Pill> : <Pill>Contact</Pill>) },
          { key: 'name', label: 'From', render: (m) => <>{m.name}<span className="block text-xs text-graphite-400">{m.bulk?.organisation || m.email}</span></> },
          { key: 'subject', label: 'Subject', render: (m) => <span className="line-clamp-2 max-w-md">{m.subject || m.bulk?.products || m.message}</span> },
          { key: 'status', label: 'Status', render: (m) => <Status value={m.status} /> },
        ]}
        footer={<Pager meta={list.meta} onPage={(page) => set({ page })} />}
      />
      {open ? (
        <Drawer
          open
          onClose={() => setOpen(null)}
          title={open.type === 'bulk_order' ? 'Bulk order enquiry' : 'Message'}
          footer={
            can('grievances:write') ? (
              <>
                <a className="btn-outline mr-auto" href={`mailto:${open.email}?subject=${encodeURIComponent(`Re: ${open.subject || 'Your enquiry to DareDevil Gears'}`)}`}>
                  Reply by email
                </a>
                {open.status !== 'in_progress' ? <button type="button" className="btn-outline" onClick={() => update.mutate({ id: open._id, status: 'in_progress' })}>Mark in progress</button> : null}
                {open.status !== 'closed' ? <button type="button" className="btn-dark" onClick={() => update.mutate({ id: open._id, status: 'closed' })}>Close</button> : null}
              </>
            ) : null
          }
        >
          <div className="space-y-4">
            <KeyValue
              rows={[
                ['From', open.name],
                ['Email', <a key="e" className="link" href={`mailto:${open.email}`}>{open.email}</a>],
                ['Phone', open.phone],
                ['Received', dateTime(open.createdAt)],
                ...(open.type === 'bulk_order'
                  ? [
                      ['Organisation', open.bulk?.organisation],
                      ['Products', open.bulk?.products],
                      ['Quantity', open.bulk?.quantity],
                      ['Deliver to', open.bulk?.deliveryLocation],
                      ['Government / institution', open.bulk?.isGovernment ? 'Yes' : 'No'],
                    ]
                  : [['Subject', open.subject]]),
              ]}
            />
            <p className="whitespace-pre-line rounded bg-stone-200 p-3 text-sm">{open.message}</p>
          </div>
        </Drawer>
      ) : null}
    </Guard>
  );
}
