'use client';

import { useState } from 'react';
import { useList, useUrlState } from '@/lib/hooks';
import { dateTime } from '@/lib/format';
import { PageHeader, DataTable, Pager, Toolbar, SearchInput, FilterSelect, Drawer, KeyValue } from '@/components/ui';
import Guard from '@/components/shell/Guard';

const ENTITIES = ['Product', 'Order', 'User', 'Category', 'Coupon', 'SiteSetting', 'TaxConfiguration', 'ShippingRate', 'ShippingZone', 'CMSPage', 'Banner', 'HomeSection', 'Review', 'ReturnRequest', 'ProductVariant', 'GrievanceComplaint'];

export default function AuditLogPage() {
  const [state, set] = useUrlState({});
  const list = useList('/audit-logs', { ...state, limit: 50 });
  const [open, setOpen] = useState(null);
  return (
    <Guard perm="audit:read">
      <PageHeader title="Audit log" description="Every admin sign-in and change, with who did it and from where. Entries cannot be edited or deleted from the admin." />
      <Toolbar>
        <SearchInput value={state.action} onChange={(action) => set({ action })} placeholder="Action starts with, e.g. order. or product.publish" />
        <FilterSelect label="Record" value={state.entity} onChange={(entity) => set({ entity })} options={ENTITIES.map((e) => [e, e])} />
      </Toolbar>
      <DataTable
        rows={list.items}
        isLoading={list.isLoading}
        error={list.error}
        onRowClick={setOpen}
        columns={[
          { key: 'createdAt', label: 'When', render: (a) => <span className="whitespace-nowrap">{dateTime(a.createdAt)}</span> },
          { key: 'actor', label: 'Who', render: (a) => a.actorEmail || 'System' },
          { key: 'action', label: 'Action', render: (a) => <span className="font-mono text-xs">{a.action}</span> },
          { key: 'entity', label: 'Record', render: (a) => a.entity },
          { key: 'summary', label: 'Details', render: (a) => <span className="line-clamp-2 max-w-md text-graphite-600">{a.summary || '—'}</span> },
          { key: 'ip', label: 'IP', render: (a) => <span className="font-mono text-xs text-graphite-400">{a.ip || '—'}</span> },
        ]}
        footer={<Pager meta={list.meta} onPage={(page) => set({ page })} />}
      />
      {open ? (
        <Drawer open onClose={() => setOpen(null)} title={open.action}>
          <div className="space-y-4">
            <KeyValue rows={[['When', dateTime(open.createdAt)], ['Who', open.actorEmail || 'System'], ['Role', open.actorRole], ['Record', `${open.entity}${open.entityId ? ` ${open.entityId}` : ''}`], ['IP', open.ip], ['Browser', open.userAgent]]} />
            {open.summary ? <p className="rounded bg-stone-200 p-3 text-sm">{open.summary}</p> : null}
            {open.changes || open.before || open.after ? (
              <pre className="max-h-[60vh] overflow-auto rounded bg-ink p-3 text-xs text-stone">{JSON.stringify(open.changes || { before: open.before, after: open.after }, null, 2)}</pre>
            ) : null}
          </div>
        </Drawer>
      ) : null}
    </Guard>
  );
}
