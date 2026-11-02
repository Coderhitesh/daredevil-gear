'use client';

import { useQuery } from '@tanstack/react-query';
import { Controller } from 'react-hook-form';
import { api } from '@/lib/api';
import ResourcePage from '@/components/resource/ResourcePage';
import BundleItemsEditor from '@/components/form/BundleItemsEditor';
import { Status, Notice, Pill } from '@/components/ui';
import { inr, date } from '@/lib/format';

export default function OffersPage() {
  const { data: cats = [] } = useQuery({ queryKey: ['/categories', 'all'], queryFn: () => api('/categories', { query: { limit: 200 } }).then((r) => r.data) });
  const fields = [
    { name: 'type', label: 'Offer type', type: 'select', required: true, options: [['bundle', 'Combo — buy these together for one price'], ['multi_buy', 'Multi-buy — buy N or more, get % off']] },
    { name: 'name', label: 'Name shown to customers', required: true, placeholder: 'Trek pair: sling bag + torch' },
    { name: 'description', label: 'Short line (optional)', type: 'textarea', rows: 2, placeholder: 'Everything you need for a night hike' },
    {
      name: 'items',
      type: 'custom',
      submit: true,
      span: 2,
      show: (v) => v.type === 'bundle',
      render: ({ form }) => <Controller control={form.control} name="items" render={({ field, fieldState }) => <BundleItemsEditor value={field.value} onChange={field.onChange} error={fieldState.error?.message} />} />,
    },
    { name: 'bundlePrice', label: 'Combo price (GST included)', type: 'money', show: (v) => v.type === 'bundle', hint: 'Price for one complete set. Applied once per complete set in the cart.' },
    { name: 'minQuantity', label: 'Minimum items', type: 'number', step: 1, min: 2, max: 50, show: (v) => v.type === 'multi_buy', hint: 'Any mix of eligible products' },
    { name: 'percentOff', label: '% off those items', type: 'number', step: 1, min: 1, max: 90, show: (v) => v.type === 'multi_buy' },
    { name: 'maxDiscount', label: 'Maximum discount', type: 'money', nullable: true, show: (v) => v.type === 'multi_buy', hint: 'Optional cap in rupees' },
    { name: 'eligibleProducts', label: 'Eligible products', type: 'products', show: (v) => v.type === 'multi_buy' },
    { name: 'eligibleCategories', label: 'Or whole categories', type: 'multiselect', options: cats.map((c) => [String(c._id), c.name]), show: (v) => v.type === 'multi_buy' },
    { name: 'combinableWithCoupons', label: 'Coupons can be used on top of this offer', type: 'checkbox', hint: 'Off = coupons only apply to other items in the cart' },
    { name: 'showOnProductPage', label: 'Show on the product page and homepage', type: 'checkbox' },
    { name: 'priority', label: 'Priority', type: 'number', step: 1, hint: 'Lower runs first when two offers could use the same item' },
    { name: 'startsAt', label: 'Starts', type: 'datetime' },
    { name: 'endsAt', label: 'Ends', type: 'datetime' },
    { name: 'isActive', label: 'Active', type: 'checkbox' },
  ];

  return (
    <ResourcePage
      title="Combo offers"
      description="Automatic offers applied in the cart. Savings are calculated from today's prices; a combo that would not save money is not applied."
      path="/offers"
      perm="orders:read"
      writePerm="coupons:write"
      entityLabel="offer"
      newLabel="New offer"
      fields={fields}
      defaults={{ type: 'bundle', isActive: true, showOnProductPage: true, combinableWithCoupons: false, priority: 100, minQuantity: 3, items: [] }}
      load={(doc) => ({
        ...doc,
        items: (doc.items || []).map((it) => ({ product: String(it.product?._id || it.product), name: it.product?.name, sku: it.product?.sku, price: it.product?.pricing?.priceInclusive ?? null, quantity: it.quantity, variant: it.variant || undefined })),
      })}
      prepare={(body) => ({
        ...body,
        items: body.type === 'bundle' ? (body.items || []).map((it) => ({ product: it.product, quantity: Number(it.quantity) || 1, ...(it.variant ? { variant: it.variant } : {}) })) : [],
      })}
      filters={[
        { key: 'type', label: 'Type', options: [['bundle', 'Combo'], ['multi_buy', 'Multi-buy']] },
        { key: 'active', label: 'Status', options: [['true', 'Active'], ['false', 'Inactive']] },
      ]}
      notice={
        <div className="mb-4">
          <Notice tone="info">Offers show on the homepage ("Offers & combos"), on product pages and in the cart. GST is recalculated on the discounted price. To post an offer picture that opens a product, use Banners → placement "Homepage offer post".</Notice>
        </div>
      }
      columns={[
        { key: 'name', label: 'Offer', render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'type', label: 'Type', render: (r) => <Pill>{r.type === 'bundle' ? 'Combo' : 'Multi-buy'}</Pill> },
        {
          key: 'deal',
          label: 'Deal',
          render: (r) =>
            r.type === 'bundle'
              ? `${(r.items || []).map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${i.product?.name || 'product'}`).join(' + ')} → ${inr(r.bundlePrice)}`
              : `${r.minQuantity}+ items: ${r.percentOff}% off${r.maxDiscount ? ` (max ${inr(r.maxDiscount)})` : ''}`,
        },
        { key: 'dates', label: 'Valid', render: (r) => (r.startsAt || r.endsAt ? `${date(r.startsAt)} to ${date(r.endsAt)}` : 'Always') },
        { key: 'isActive', label: 'Status', render: (r) => <Status value={r.isActive ? 'active' : 'archived'} label={r.isActive ? 'Active' : 'Inactive'} /> },
      ]}
    />
  );
}
