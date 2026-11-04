'use client';

import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api, applyFieldErrors } from '@/lib/api';
import { useAction, useCan } from '@/lib/hooks';
import { dateTime } from '@/lib/format';
import { PageHeader, Card, Notice, Spinner } from '@/components/ui';
import { FieldSet, toBody, toFormValues } from '@/components/form/fields';
import Guard from '@/components/shell/Guard';

const RATES = [0, 5, 12, 18].map((r) => [String(r), `${r}%`]);
const fields = [
  { name: 'sellerState', label: 'Seller state (place of supply origin)', required: true, hint: 'Orders delivered in this state get CGST + SGST; other states get IGST' },
  { name: 'sellerStateCode', label: 'GST state code', required: true, hint: 'Two digits, e.g. 09 for Uttar Pradesh' },
  { name: 'h1', label: 'Apparel & footwear rule', type: 'heading' },
  { name: 'apparelRule.thresholdPerPiece', label: 'Threshold per piece (excl. GST)', type: 'money', hint: 'Rupees. Pieces at or below this value use the low rate.' },
  { name: 'apparelRule.lowRate', label: 'Low rate', type: 'select', numeric: true, options: RATES },
  { name: 'apparelRule.highRate', label: 'High rate', type: 'select', numeric: true, options: RATES },
  { name: 'h2', label: 'Charges', type: 'heading' },
  { name: 'shippingTaxRate', label: 'GST on delivery charges', type: 'select', numeric: true, options: RATES },
  { name: 'packagingTaxMode', label: 'GST on packaging', type: 'select', options: [['item_rate', "Same rate as the item it packs"], ['fixed', 'A fixed rate']] },
  { name: 'packagingFixedRate', label: 'Fixed packaging rate', type: 'select', numeric: true, options: RATES, show: (v) => v.packagingTaxMode === 'fixed' },
  { name: 'h3', label: 'Review', type: 'heading' },
  { name: 'reviewedByAccountant', label: 'These rules have been confirmed by our chartered accountant', type: 'checkbox' },
  { name: 'reviewNote', label: 'Review note', type: 'textarea', rows: 3, hint: 'Who confirmed it and when' },
];

export default function TaxPage() {
  const can = useCan();
  const { data, isLoading } = useQuery({ queryKey: ['/tax'], queryFn: () => api('/tax') });
  return (
    <Guard perm="settings:read">
      <PageHeader title="GST & tax" description="All catalogue prices include GST. These rules decide how GST is split on invoices. Per-product rates and HSN codes are set on each product." />
      {isLoading || !data ? <div className="skeleton h-64" /> : <TaxForm key={data.updatedAt || 'x'} data={data} writable={can('tax:write')} />}
    </Guard>
  );
}

function TaxForm({ data, writable }) {
  const form = useForm({ defaultValues: toFormValues(fields, data) });
  const save = useAction((v) => api('/tax', { method: 'PUT', body: { ...toBody(fields, v), reviewNote: v.reviewNote || '' } }), {
    invalidate: ['/tax', 'system-status'],
    success: 'Tax rules saved. They apply to new orders only; existing invoices keep their original tax.',
    onError: (err) => applyFieldErrors(err, form.setError) && false,
  });
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="space-y-5">
          {!data.reviewedByAccountant ? (
            <Notice tone="caution" title="Not yet confirmed by an accountant">
              {data.reviewNote || 'Have your CA confirm the apparel threshold, rates on delivery and packaging, and every HSN code before launch.'}
            </Notice>
          ) : (
            <Notice tone="okay" title="Confirmed">{data.reviewedAt ? `Marked reviewed on ${dateTime(data.reviewedAt)}` : 'Marked reviewed'}</Notice>
          )}
          <fieldset disabled={!writable}>
            <FieldSet fields={fields} form={form} />
          </fieldset>
          {writable ? (
            <div className="flex justify-end border-t border-stone-300 pt-4">
              <button type="submit" className="btn-primary" disabled={save.isPending}>
                {save.isPending ? <Spinner /> : null} Save tax rules
              </button>
            </div>
          ) : null}
        </form>
      </Card>
      <Card title="How it is applied" bodyClass="card-body text-sm text-graphite-600">
        <ul className="list-disc space-y-1.5 pl-4">
          <li>Each order line stores its rate, taxable value and tax at the moment of purchase. Changing rules never rewrites past orders.</li>
          <li>Coupons reduce the taxable value; GST is recalculated on the discounted price.</li>
          <li>For apparel and footwear the rate is decided per piece from the price after discount.</li>
          <li>Invoices show HSN, rate, taxable value and CGST/SGST or IGST for every line.</li>
        </ul>
      </Card>
    </div>
  );
}
