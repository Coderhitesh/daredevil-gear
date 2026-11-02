'use client';

import ResourcePage from '@/components/resource/ResourcePage';
import { Status, Pill } from '@/components/ui';

const fields = [
  { name: 'name', label: 'Brand name', required: true },
  { name: 'slug', label: 'URL slug', required: true, hint: 'Lowercase letters, numbers and hyphens' },
  { name: 'isOwnBrand', label: 'Our own brand (DareDevil Gears)', type: 'checkbox' },
  { name: 'authorisedDistributorProof', label: 'Authorised-distributor proof on file', type: 'checkbox', hint: 'Required before listing third-party brands' },
  { name: 'isActive', label: 'Active', type: 'checkbox' },
  { name: 'notes', label: 'Internal notes', type: 'textarea' },
];

export default function BrandsPage() {
  return (
    <ResourcePage
      title="Brands"
      description="Third-party brands need proof that we are an authorised seller before their products are published."
      path="/brands"
      perm="products:read"
      writePerm="categories:write"
      entityLabel="brand"
      newLabel="Add brand"
      fields={fields}
      defaults={{ isActive: true }}
      columns={[
        { key: 'name', label: 'Brand', render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'slug', label: 'Slug' },
        { key: 'own', label: 'Type', render: (r) => (r.isOwnBrand ? <Pill tone="signal">Own brand</Pill> : r.authorisedDistributorProof ? <Pill tone="okay">Authorised</Pill> : <Pill tone="caution">Proof needed</Pill>) },
        { key: 'isActive', label: 'Status', render: (r) => <Status value={r.isActive ? 'active' : 'archived'} label={r.isActive ? 'Active' : 'Inactive'} /> },
      ]}
    />
  );
}
