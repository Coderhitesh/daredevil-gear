'use client';

import ResourcePage from '@/components/resource/ResourcePage';
import { Status, Pill, Notice } from '@/components/ui';
import { ago, storefrontUrl } from '@/lib/format';

const fields = [
  { name: 'title', label: 'Title', required: true },
  { name: 'slug', label: 'URL slug', required: true, hint: 'Shown at /pages/your-slug' },
  { name: 'group', label: 'Footer group', type: 'select', required: true, options: [['policy', 'Policies'], ['company', 'Company'], ['help', 'Help']] },
  { name: 'sortOrder', label: 'Sort order', type: 'number' },
  { name: 'excerpt', label: 'Summary', type: 'textarea', rows: 2 },
  {
    name: 'body',
    label: 'Content (HTML)',
    type: 'html',
    rows: 22,
    hint: 'Allowed: headings, paragraphs, lists, links, bold, tables. Scripts and styles are removed. Wrap unconfirmed details in <span class="pending">…</span> so they stand out.',
  },
  { name: 'requiresReview', label: 'Needs legal/business review before launch', type: 'checkbox' },
  { name: 'reviewNotes', label: 'Review notes', type: 'textarea', rows: 2, show: (v) => v.requiresReview },
  { name: 'isPublished', label: 'Published', type: 'checkbox' },
  { name: 'seo.title', label: 'SEO title' },
  { name: 'seo.description', label: 'SEO description', type: 'textarea', rows: 2 },
];

export default function PagesPage() {
  return (
    <ResourcePage
      title="Pages & policies"
      description="Policy pages were seeded as drafts for India. Have them reviewed by your legal adviser and fill the highlighted placeholders before launch."
      path="/pages"
      perm="content:write"
      writePerm="content:write"
      entityLabel="page"
      newLabel="New page"
      fields={fields}
      defaults={{ group: 'help', isPublished: false }}
      deletable
      notice={<div className="mb-4"><Notice tone="caution" title="Legal text is a draft">These pages do not constitute legal advice. Legal name, CIN, grievance officer and registered address must be confirmed by the business.</Notice></div>}
      columns={[
        { key: 'title', label: 'Page', render: (r) => <span className="font-medium">{r.title}</span> },
        { key: 'group', label: 'Group', render: (r) => <Pill>{r.group}</Pill> },
        { key: 'slug', label: 'URL', render: (r) => <a className="link" href={storefrontUrl(`/pages/${r.slug}`)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>/pages/{r.slug}</a> },
        { key: 'review', label: 'Review', render: (r) => (r.requiresReview ? <Pill tone="caution">Needs review</Pill> : <Pill tone="okay">Reviewed</Pill>) },
        { key: 'version', label: 'Version', align: 'right', render: (r) => `v${r.version || 1}` },
        { key: 'updatedAt', label: 'Updated', render: (r) => ago(r.updatedAt) },
        { key: 'isPublished', label: 'Status', render: (r) => <Status value={r.isPublished ? 'published' : 'draft'} /> },
      ]}
    />
  );
}
