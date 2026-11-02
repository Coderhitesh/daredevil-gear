'use client';

import ResourcePage from '@/components/resource/ResourcePage';
import { Status, Pill } from '@/components/ui';
import { date } from '@/lib/format';

const fields = [
  { name: 'placement', label: 'Placement', type: 'select', required: true, options: [['hero', 'Homepage hero'], ['promo', 'Homepage promo tiles'], ['category', 'Category pages']] },
  { name: 'layout', label: 'Banner style', type: 'select', required: true, options: [['overlay', 'Photo with title and buttons on top'], ['image_only', 'Designed banner image only (text is in the picture)']], hint: '"Image only" needs a desktop image; the title is used as its description' },
  { name: 'linkHref', label: 'Open this page when the banner is clicked', placeholder: '/collections/monsoon-gear or https://…', span: 2, hint: 'Optional. Leave empty if the banner should not be clickable.' },
  { name: 'openInNewTab', label: 'Open the link in a new tab', type: 'checkbox', show: (v) => Boolean(v.linkHref) },
  { name: 'durationSeconds', label: 'Show each time for (seconds)', type: 'number', step: 1, min: 3, max: 30, hint: 'Homepage slider moves to the next banner after this' },
  { name: 'theme', label: 'Text colour', type: 'select', required: true, options: [['dark', 'Light text on dark image'], ['light', 'Dark text on light image']] },
  { name: 'eyebrow', label: 'Small line above the title', hint: 'Optional, up to 60 characters' },
  { name: 'title', label: 'Title', required: true, span: 2 },
  { name: 'subtitle', label: 'Supporting text', type: 'textarea', rows: 2 },
  { name: 'ctaLabel', label: 'Button label' },
  { name: 'ctaHref', label: 'Button link', placeholder: '/category/bags-backpacks' },
  { name: 'secondaryCtaLabel', label: 'Second button label' },
  { name: 'secondaryCtaHref', label: 'Second button link' },
  { name: 'image.desktop', label: 'Desktop image', type: 'imageurl', folder: 'banners', hint: '2400×1000 recommended. Without an image the banner uses the brand contour pattern.' },
  { name: 'image.mobile', label: 'Mobile image', type: 'imageurl', folder: 'banners', hint: '1080×1350 recommended. Falls back to the desktop image.' },
  { name: 'image.alt', label: 'Image description (alt text)', span: 2 },
  { name: 'startsAt', label: 'Show from', type: 'datetime' },
  { name: 'endsAt', label: 'Show until', type: 'datetime' },
  { name: 'sortOrder', label: 'Sort order', type: 'number' },
  { name: 'isActive', label: 'Active', type: 'checkbox' },
];

export default function BannersPage() {
  return (
    <ResourcePage
      title="Banners"
      description="Hero and promo banners. Offers shown here must be genuine and match the prices in the catalogue."
      path="/banners"
      perm="content:write"
      writePerm="content:write"
      entityLabel="banner"
      newLabel="New banner"
      fields={fields}
      defaults={{ placement: 'hero', theme: 'dark', layout: 'overlay', durationSeconds: 6, isActive: true }}
      filters={[{ key: 'placement', label: 'Placement', options: ['hero', 'promo', 'category'] }]}
      columns={[
        { key: 'title', label: 'Title', render: (r) => <span className="font-medium">{r.title}</span> },
        { key: 'placement', label: 'Placement', render: (r) => <Pill>{r.placement}</Pill> },
        { key: 'linkHref', label: 'Click opens', render: (r) => (r.linkHref ? <span className="text-xs">{r.linkHref}</span> : <span className="text-graphite-400">—</span>) },
        { key: 'image', label: 'Image', render: (r) => (r.image?.desktop ? 'Yes' : <span className="text-caution">Pattern only</span>) },
        { key: 'when', label: 'Schedule', render: (r) => (r.startsAt || r.endsAt ? `${date(r.startsAt)} to ${date(r.endsAt)}` : 'Always') },
        { key: 'sortOrder', label: 'Order', align: 'right' },
        { key: 'isActive', label: 'Status', render: (r) => <Status value={r.isActive ? 'active' : 'archived'} label={r.isActive ? 'Active' : 'Inactive'} /> },
      ]}
    />
  );
}
