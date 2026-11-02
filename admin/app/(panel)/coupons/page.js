'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import ResourcePage from '@/components/resource/ResourcePage';
import { Status, Notice } from '@/components/ui';
import { inr, date } from '@/lib/format';

export default function CouponsPage() {
  const { data: cats = [] } = useQuery({ queryKey: ['/categories', 'all'], queryFn: () => api('/categories', { query: { limit: 200 } }).then((r) => r.data) });
  const fields = [
    { name: 'code', label: 'Code', required: true, hint: 'Customers type this at checkout. Letters, numbers, - and _' },
    { name: 'description', label: 'Internal description' },
    { name: 'type', label: 'Discount type', type: 'select', required: true, options: [['percent', 'Percentage off'], ['fixed', 'Fixed amount off']] },
    { name: 'value', label: 'Percent off', type: 'number', required: true, step: 1, min: 1, max: 90, show: (v) => v.type === 'percent' },
    { name: '_fixed', label: 'Amount off', type: 'money', required: true, show: (v) => v.type === 'fixed', hint: 'Rupees' },
    { name: 'maxDiscount', label: 'Maximum discount', type: 'money', nullable: true, show: (v) => v.type === 'percent', hint: 'Cap for percentage coupons (rupees). Leave blank for no cap.' },
    { name: 'minCartValue', label: 'Minimum cart value', type: 'money', hint: 'Rupees, GST inclusive' },
    { name: 'startsAt', label: 'Starts', type: 'datetime' },
    { name: 'endsAt', label: 'Ends', type: 'datetime' },
    { name: 'usageLimit', label: 'Total uses allowed', type: 'number', nullable: true, step: 1, hint: 'Blank = unlimited' },
    { name: 'perCustomerLimit', label: 'Uses per customer', type: 'number', step: 1, hint: '0 = unlimited' },
    { name: 'eligibleCategories', label: 'Only for these categories', type: 'multiselect', options: cats.map((c) => [String(c._id), c.name]), hint: 'Leave all unticked to allow every category' },
    { name: 'eligibleProducts', label: 'Only for these products', type: 'products', hint: 'Optional. Leave empty to allow all products.' },
    { name: 'excludeSaleItems', label: 'Exclude items already on sale', type: 'checkbox' },
    { name: 'newCustomersOnly', label: 'First order only', type: 'checkbox' },
    { name: 'isActive', label: 'Active', type: 'checkbox' },
  ];

  return (
    <ResourcePage
      title="Coupons"
      description="Coupons are validated again on the server when the order is placed. A used coupon can be disabled but not deleted."
      path="/coupons"
      perm="orders:read"
      writePerm="coupons:write"
      entityLabel="coupon"
      newLabel="New coupon"
      fields={fields}
      defaults={{ type: 'percent', isActive: true, perCustomerLimit: 1, excludeSaleItems: true }}
      // the API stores both kinds in `value`: percent for percentage coupons, paise for fixed ones
      load={(doc) => (doc.type === 'fixed' ? { ...doc, _fixed: doc.value } : doc)}
      prepare={({ _fixed, ...body }) => (body.type === 'fixed' ? { ...body, value: _fixed } : body)}
      filters={[{ key: 'active', label: 'Status', options: [['true', 'Active'], ['false', 'Inactive']] }]}
      notice={<div className="mb-4"><Notice tone="info">Discounts apply to GST-inclusive prices and GST is recalculated on the discounted value. Show only genuine offers.</Notice></div>}
      columns={[
        { key: 'code', label: 'Code', render: (r) => <span className="font-mono font-semibold">{r.code}</span> },
        { key: 'value', label: 'Discount', render: (r) => (r.type === 'percent' ? `${r.value}%${r.maxDiscount ? ` up to ${inr(r.maxDiscount)}` : ''}` : inr(r.value)) },
        { key: 'min', label: 'Min. cart', render: (r) => (r.minCartValue ? inr(r.minCartValue) : '—') },
        { key: 'dates', label: 'Valid', render: (r) => (r.startsAt || r.endsAt ? `${date(r.startsAt)} to ${date(r.endsAt)}` : 'Always') },
        { key: 'usage', label: 'Used', align: 'right', render: (r) => `${r.usageCount || 0}${r.usageLimit ? ` / ${r.usageLimit}` : ''}` },
        { key: 'isActive', label: 'Status', render: (r) => <Status value={r.isActive ? 'active' : 'archived'} label={r.isActive ? 'Active' : 'Inactive'} /> },
      ]}
    />
  );
}
