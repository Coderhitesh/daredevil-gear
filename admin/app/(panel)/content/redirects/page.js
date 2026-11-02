'use client';

import ResourcePage from '@/components/resource/ResourcePage';
import { Status, Pill, Notice } from '@/components/ui';

const fields = [
  { name: 'from', label: 'Old path', required: true, placeholder: '/index.php', hint: 'Path only, starting with /. Query strings are not matched.' },
  { name: 'to', label: 'New path or URL', required: true, placeholder: '/category/bags-backpacks', hint: 'Ignored for 410 Gone' },
  { name: 'statusCode', label: 'Type', type: 'select', numeric: true, required: true, options: [['301', '301 Moved permanently'], ['302', '302 Temporary'], ['410', '410 Gone (removed)']] },
  { name: 'note', label: 'Note', hint: 'Why this redirect exists' },
  { name: 'isActive', label: 'Active', type: 'checkbox' },
];

export default function RedirectsPage() {
  return (
    <ResourcePage
      title="Redirects"
      description="Send old URLs (for example from the previous OpenCart site) to their new pages so search rankings and bookmarks keep working."
      path="/redirects"
      perm="content:write"
      writePerm="content:write"
      entityLabel="redirect"
      newLabel="Add redirect"
      fields={fields}
      defaults={{ statusCode: 301, isActive: true }}
      notice={<div className="mb-4"><Notice tone="info">Changes reach the storefront within about a minute.</Notice></div>}
      columns={[
        { key: 'from', label: 'From', render: (r) => <code className="text-xs">{r.from}</code> },
        { key: 'to', label: 'To', render: (r) => (r.statusCode === 410 ? <span className="text-graphite-400">Removed</span> : <code className="text-xs">{r.to}</code>) },
        { key: 'statusCode', label: 'Type', render: (r) => <Pill tone={r.statusCode === 410 ? 'alert' : 'muted'}>{r.statusCode}</Pill> },
        { key: 'note', label: 'Note' },
        { key: 'isActive', label: 'Status', render: (r) => <Status value={r.isActive ? 'active' : 'archived'} label={r.isActive ? 'Active' : 'Inactive'} /> },
      ]}
    />
  );
}
