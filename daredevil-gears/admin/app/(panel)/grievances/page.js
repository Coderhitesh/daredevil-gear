'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAction, useCan, useList, useUrlState } from '@/lib/hooks';
import { dateTime, humanize } from '@/lib/format';
import { PageHeader, DataTable, Pager, Tabs, Status, Pill, Drawer, Select, Textarea, Spinner, KeyValue, Notice } from '@/components/ui';
import Guard from '@/components/shell/Guard';

export default function GrievancesPage() {
  const [state, set] = useUrlState({});
  const list = useList('/grievances', { ...state, limit: 50 });
  const [open, setOpen] = useState(null);

  return (
    <Guard perm="grievances:read">
      <PageHeader title="Grievances" description="Complaints submitted to the Grievance Officer. Under the Consumer Protection (E-Commerce) Rules, 2020 each must be acknowledged within 48 hours and resolved within one month." />
      <Tabs value={state.status || ''} onChange={(status) => set({ status })} tabs={[['', 'All'], ['open', 'New'], ['acknowledged', 'Acknowledged'], ['in_progress', 'In progress'], ['resolved', 'Resolved'], ['closed', 'Closed']]} />
      <DataTable
        rows={list.items}
        isLoading={list.isLoading}
        error={list.error}
        onRowClick={setOpen}
        columns={[
          { key: 'ticketNumber', label: 'Ticket', render: (g) => <span className="font-medium">{g.ticketNumber}</span> },
          { key: 'createdAt', label: 'Received', render: (g) => <span className="whitespace-nowrap">{dateTime(g.createdAt)}</span> },
          { key: 'name', label: 'From', render: (g) => <>{g.name}<span className="block text-xs text-graphite-400">{g.email}</span></> },
          { key: 'category', label: 'Topic', render: (g) => humanize(g.category) },
          { key: 'subject', label: 'Subject', render: (g) => <span className="line-clamp-2 max-w-sm">{g.subject}</span> },
          {
            key: 'due',
            label: 'Deadline',
            render: (g) =>
              g.ackOverdue ? <Pill tone="alert">Acknowledgement overdue</Pill> : g.resolveOverdue ? <Pill tone="alert">Resolution overdue</Pill> : ['resolved', 'closed'].includes(g.status) ? '—' : <span className="text-xs">{g.acknowledgedAt ? `Resolve by ${dateTime(g.dueResolveBy)}` : `Acknowledge by ${dateTime(g.dueAcknowledgeBy)}`}</span>,
          },
          { key: 'status', label: 'Status', render: (g) => <Status value={g.status} /> },
        ]}
        footer={<Pager meta={list.meta} onPage={(page) => set({ page })} />}
      />
      {open ? <GrievanceDrawer g={open} onClose={() => setOpen(null)} /> : null}
    </Guard>
  );
}

function GrievanceDrawer({ g, onClose }) {
  const can = useCan();
  const [status, setStatus] = useState(g.status === 'open' ? 'acknowledged' : g.status);
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState(g.resolution || '');
  const save = useAction(() => api(`/grievances/${g._id}`, { method: 'PATCH', body: { status, note: note.trim() || undefined, resolution: resolution.trim() || undefined } }), { invalidate: ['/grievances'], success: 'Grievance updated', onSuccess: onClose });
  const needsResolution = ['resolved', 'closed'].includes(status) && resolution.trim().length < 10;
  return (
    <Drawer
      open
      onClose={onClose}
      title={g.ticketNumber}
      footer={
        can('grievances:write') ? (
          <>
            <button type="button" className="btn-outline" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn-primary" disabled={save.isPending || needsResolution} onClick={() => save.mutate()}>
              {save.isPending ? <Spinner /> : null} Save
            </button>
          </>
        ) : null
      }
    >
      <div className="space-y-5">
        {g.ackOverdue || g.resolveOverdue ? <Notice tone="alert" title="Statutory deadline missed">Respond to the customer today and record what happened.</Notice> : null}
        <KeyValue
          rows={[
            ['From', `${g.name} (${g.email}${g.phone ? `, ${g.phone}` : ''})`],
            ['Order', g.orderNumber || '—'],
            ['Topic', humanize(g.category)],
            ['Received', dateTime(g.createdAt)],
            ['Acknowledged', dateTime(g.acknowledgedAt)],
            ['Resolve by', dateTime(g.dueResolveBy)],
          ]}
        />
        <div>
          <p className="label">{g.subject}</p>
          <p className="whitespace-pre-line rounded bg-stone-200 p-3 text-sm">{g.description}</p>
        </div>
        {g.history?.length ? (
          <ol className="border-l-2 border-stone-300 pl-4 text-xs">
            {g.history.map((h, i) => (
              <li key={i} className="mb-2">
                <strong>{humanize(h.status)}</strong> {h.note ? `— ${h.note}` : ''}
                <span className="block text-graphite-400">{dateTime(h.at)}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {can('grievances:write') ? (
          <div className="space-y-4 border-t border-stone-300 pt-4">
            <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[['acknowledged', 'Acknowledged'], ['in_progress', 'In progress'], ['resolved', 'Resolved'], ['closed', 'Closed']]} />
            <Textarea label="Internal note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            <Textarea label="Resolution" rows={4} value={resolution} onChange={(e) => setResolution(e.target.value)} required={['resolved', 'closed'].includes(status)} hint="What was done for the customer. Required to resolve." />
            {g.orderNumber ? (
              <Link href={`/orders?q=${encodeURIComponent(g.orderNumber)}`} className="link text-sm">
                Find order {g.orderNumber}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
