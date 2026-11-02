'use client';

import ResourcePage from '@/components/resource/ResourcePage';
import { Status } from '@/components/ui';
import { storefrontUrl } from '@/lib/format';

const fields = [
  { name: 'name', label: 'Collection name', required: true },
  { name: 'slug', label: 'URL slug', required: true, hint: 'Shown at /collections/your-slug' },
  { name: 'description', label: 'Description', type: 'textarea', rows: 3 },
  { name: 'image', label: 'Image', type: 'image', folder: 'collections' },
  { name: 'products', label: 'Products', type: 'products', hint: 'Only published products are shown on the storefront. Order here is the display order.' },
  { name: 'sortOrder', label: 'Sort order', type: 'number' },
  { name: 'isActive', label: 'Active', type: 'checkbox' },
  { name: 'seo.title', label: 'SEO title', hint: 'Up to 70 characters' },
  { name: 'seo.description', label: 'SEO description', type: 'textarea', rows: 2, hint: 'Up to 170 characters' },
];

export default function CollectionsPage() {
  return (
    <ResourcePage
      title="Collections"
      description="Hand-picked groups of products for campaigns and homepage rails. Empty collections are hidden from the store."
      path="/collections"
      perm="products:read"
      writePerm="categories:write"
      entityLabel="collection"
      newLabel="Add collection"
      fields={fields}
      defaults={{ isActive: true, products: [] }}
      columns={[
        { key: 'name', label: 'Collection', render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'slug', label: 'URL', render: (r) => <a className="link" href={storefrontUrl(`/collections/${r.slug}`)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>/collections/{r.slug}</a> },
        { key: 'products', label: 'Products', align: 'right', render: (r) => r.products?.length || 0 },
        { key: 'isActive', label: 'Status', render: (r) => <Status value={r.isActive ? 'active' : 'archived'} label={r.isActive ? 'Active' : 'Inactive'} /> },
      ]}
    />
  );
}
