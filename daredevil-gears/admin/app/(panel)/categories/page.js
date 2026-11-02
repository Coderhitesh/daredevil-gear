'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import ResourcePage from '@/components/resource/ResourcePage';
import { Status, Pill } from '@/components/ui';
import { storefrontUrl } from '@/lib/format';

export default function CategoriesPage() {
  const { data: all = [] } = useQuery({ queryKey: ['/categories', 'all'], queryFn: () => api('/categories', { query: { limit: 200 } }).then((r) => r.data) });
  const names = useMemo(() => new Map(all.map((c) => [String(c._id), c.name])), [all]);

  const fieldsFor = (doc) => [
    { name: 'name', label: 'Category name', required: true },
    { name: 'slug', label: 'URL slug', hint: 'Leave blank to generate from the name' },
    {
      name: 'parent',
      label: 'Parent category',
      type: 'select',
      nullable: true,
      placeholder: 'None (top level)',
      options: all.filter((c) => String(c._id) !== String(doc._id) && !(c.ancestors || []).map(String).includes(String(doc._id)) && (c.ancestors || []).length < 2).map((c) => [String(c._id), c.name]),
      hint: 'Up to three levels deep',
    },
    { name: 'sortOrder', label: 'Sort order', type: 'number', hint: 'Lower numbers appear first in menus' },
    { name: 'description', label: 'Description', type: 'textarea', rows: 3, hint: 'Shown at the top of the category page' },
    { name: 'image', label: 'Tile image', type: 'image', folder: 'categories' },
    { name: 'isActive', label: 'Active', type: 'checkbox', hint: 'Inactive categories and their products are hidden' },
    { name: 'showInNav', label: 'Show in the main menu', type: 'checkbox', hint: 'Hidden automatically while the category has no published products' },
    { name: 'isFeatured', label: 'Feature on the homepage', type: 'checkbox' },
    { name: 'seo.title', label: 'SEO title' },
    { name: 'seo.description', label: 'SEO description', type: 'textarea', rows: 2 },
  ];

  return (
    <ResourcePage
      title="Categories"
      description="Categories with no published products are hidden from the menu and storefront automatically."
      path="/categories"
      perm="products:read"
      writePerm="categories:write"
      entityLabel="category"
      newLabel="Add category"
      fieldsFor={fieldsFor}
      fields={fieldsFor({})}
      defaults={{ isActive: true, showInNav: true }}
      limit={200}
      columns={[
        {
          key: 'name',
          label: 'Category',
          render: (r) => (
            <span className="font-medium" style={{ paddingLeft: `${(r.ancestors?.length || 0) * 16}px` }}>
              {r.name}
            </span>
          ),
        },
        { key: 'parent', label: 'Parent', render: (r) => (r.parent ? names.get(String(r.parent)) || '—' : <span className="text-graphite-400">Top level</span>) },
        { key: 'slug', label: 'URL', render: (r) => <a className="link" href={storefrontUrl(`/category/${r.slug}`)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>/category/{r.slug}</a> },
        { key: 'productCount', label: 'Published', align: 'right', render: (r) => (r.productCount ? r.productCount : <Pill tone="caution">Empty</Pill>) },
        { key: 'isActive', label: 'Status', render: (r) => <Status value={r.isActive ? 'active' : 'archived'} label={r.isActive ? (r.showInNav ? 'Active, in menu' : 'Active') : 'Inactive'} /> },
      ]}
    />
  );
}
