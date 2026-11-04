'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api, applyFieldErrors } from '@/lib/api';
import { useAction, useCan, useUrlState } from '@/lib/hooks';
import { dateTime } from '@/lib/format';
import { PageHeader, Card, Notice, Spinner, Checkbox, Pill } from '@/components/ui';
import { FieldSet, toBody, toFormValues } from '@/components/form/fields';
import Guard from '@/components/shell/Guard';

const GROUPS = {
  business: {
    label: 'Business details',
    help: 'Shown in the footer, contact page, invoices and policies. The law requires the legal name, registered address and contact details of the seller on an e-commerce site.',
    fields: [
      { name: 'displayName', label: 'Store name', required: true },
      { name: 'legalName', label: 'Registered legal name', hint: 'Exactly as on the GST / MCA registration' },
      { name: 'cin', label: 'CIN', hint: 'Company Identification Number, if a company' },
      { name: 'gstin', label: 'GSTIN' },
      { name: 'gstinVerified', label: 'GSTIN checked on the GST portal', type: 'checkbox' },
      { name: 'registeredAddress', label: 'Registered address', type: 'textarea', rows: 3 },
      { name: 'addressShort', label: 'Short address (footer)', span: 2 },
      { name: 'email', label: 'Support email', inputType: 'email', required: true },
      { name: 'phone', label: 'Support phone', required: true },
      { name: 'whatsapp', label: 'WhatsApp number', hint: 'Digits with country code, e.g. 919876543210' },
      { name: 'hours', label: 'Support hours', placeholder: 'Mon–Sat, 10am–6pm' },
      { name: 'jurisdiction', label: 'Courts with jurisdiction', placeholder: 'Courts at Gautam Buddh Nagar, Uttar Pradesh' },
      { name: 'tagline', label: 'Tagline' },
      { name: 'mapEmbedUrl', label: 'Google Maps embed URL', span: 2 },
    ],
  },
  grievanceOfficer: {
    label: 'Grievance officer',
    help: 'Required by the Consumer Protection (E-Commerce) Rules, 2020. Name, designation and contact must be displayed on the website.',
    fields: [
      { name: 'name', label: 'Name' },
      { name: 'designation', label: 'Designation' },
      { name: 'email', label: 'Email', inputType: 'email' },
      { name: 'phone', label: 'Phone' },
      { name: 'acknowledgeHours', label: 'Acknowledge within (hours)', type: 'number', step: 1, min: 1, max: 48 },
      { name: 'resolveDays', label: 'Resolve within (days)', type: 'number', step: 1, min: 1, max: 30 },
    ],
  },
  announcement: {
    label: 'Announcement bar',
    help: 'One line across the top of every page. Keep it factual.',
    fields: [
      { name: 'isActive', label: 'Show the announcement bar', type: 'checkbox' },
      { name: 'text', label: 'Text', span: 2 },
      { name: 'href', label: 'Link (optional)', span: 2 },
    ],
  },
  checkout: {
    label: 'Checkout',
    fields: [
      { name: 'guestCheckout', label: 'Allow guest checkout', type: 'checkbox', hint: 'Guests get an order link by email' },
      { name: 'orderNotesEnabled', label: 'Allow order notes', type: 'checkbox' },
      { name: 'packagingMode', label: 'Packaging charge', type: 'select', required: true, options: [['per_unit', 'Per unit'], ['per_line', 'Once per product line'], ['per_order_max', 'Highest single charge per order'], ['included', 'Included in price (not shown)']] },
      { name: 'ageConfirmationText', label: 'Age confirmation text (restricted items)', type: 'textarea', rows: 2 },
      { name: 'codEnabled', label: 'Offer cash on delivery (COD)', type: 'checkbox', span: 2, hint: 'Customers choose "Cash on delivery" at checkout; the order is confirmed straight away and sent to Shiprocket as COD' },
      { name: 'codFee', label: 'COD fee', type: 'money', show: (v) => v.codEnabled, hint: 'Fixed fee shown as its own line. 0 = no fixed fee' },
      { name: 'codAddCourierCharge', label: 'Add the courier\'s COD charge from Shiprocket', type: 'checkbox', show: (v) => v.codEnabled, hint: 'Passes on what Shiprocket charges you to collect cash' },
      { name: 'codMinOrderValue', label: 'COD minimum order value', type: 'money', show: (v) => v.codEnabled, hint: '0 = no minimum' },
      { name: 'codMaxOrderValue', label: 'COD maximum order value', type: 'money', show: (v) => v.codEnabled, hint: '0 = no limit. Couriers cap cash collection, often around ₹50,000' },
      { name: 'codGuestAllowed', label: 'Allow COD for guest checkout', type: 'checkbox', show: (v) => v.codEnabled },
      { name: 'codMaxOpenOrders', label: 'Undelivered COD orders allowed per customer', type: 'number', step: 1, min: 1, max: 50, show: (v) => v.codEnabled, hint: 'Limits fake / refused COD orders' },
    ],
    note: 'Online payment goes through Razorpay. Cash-on-delivery orders are marked paid when you mark them delivered; refunds for them are paid by bank transfer / UPI.',
  },
  shipping: {
    label: 'Shipping',
    fields: [
      { name: 'freeShippingEnabled', label: 'Offer free delivery above a threshold', type: 'checkbox' },
      { name: 'freeShippingThreshold', label: 'Free delivery threshold', type: 'money', show: (v) => v.freeShippingEnabled },
      { name: 'defaultItemWeightKg', label: 'Weight to assume when a product has none (kg)', type: 'number', step: '0.05' },
      { name: 'internationalMode', label: 'International orders', type: 'select', options: [['quote_only', 'Quote on request only'], ['enabled', 'Allow at checkout']] },
    ],
  },
  shiprocket: {
    label: 'Shiprocket',
    help: 'Live delivery charges from Shiprocket for the customer\'s PIN code, and automatic order creation in Shiprocket after payment. Login details (SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD of a Shiprocket API user) go in backend/.env, never here.',
    fields: [
      { name: 'ratesEnabled', label: 'Show Shiprocket\'s live delivery charge at checkout', type: 'checkbox', span: 2, hint: 'Product page, cart and checkout ask Shiprocket for the charge to the customer\'s PIN code' },
      { name: 'pickupPincode', label: 'Pickup PIN code', required: true, placeholder: '201301', hint: 'Where parcels are collected from — rates are calculated from here' },
      { name: 'pickupLocation', label: 'Pickup location name', required: true, placeholder: 'Primary', hint: 'Exactly as in Shiprocket → Settings → Pickup Addresses' },
      { name: 'courierChoice', label: 'Delivery options to offer', type: 'select', required: true, options: [['cheapest_and_fastest', 'Cheapest, plus a faster option when there is one'], ['cheapest', 'Cheapest courier only'], ['recommended', 'Shiprocket recommended courier only']] },
      { name: 'showCourierName', label: 'Show the courier name to customers', type: 'checkbox' },
      { name: 'addGstToRate', label: 'Add 18% GST to Shiprocket\'s rate', type: 'checkbox', hint: 'Only if your Shiprocket invoice adds GST on top of the quoted rate' },
      { name: 'handlingCharge', label: 'Extra handling charge per order', type: 'money', hint: 'Keep 0 to charge customers exactly what Shiprocket quotes' },
      { name: 'fallbackToManualRates', label: 'If Shiprocket is down, use the manual shipping zones', type: 'checkbox', span: 2, hint: 'Off = checkout waits until Shiprocket answers again' },
      { name: 'autoPush', label: 'Send paid orders to Shiprocket automatically', type: 'checkbox', span: 2, hint: 'The order appears in Shiprocket → Orders → New as soon as the payment is captured' },
      { name: 'autoAssignCourier', label: 'Also assign the courier the customer chose (generates AWB)', type: 'checkbox', span: 2, hint: 'Debits your Shiprocket wallet immediately. Leave off to review orders in Shiprocket first.' },
      { name: 'channelId', label: 'Shiprocket channel ID (optional)', hint: 'Leave empty to use the default custom channel' },
      { name: 'lengthCm', label: 'Box length (cm)', type: 'number', step: '0.5' },
      { name: 'breadthCm', label: 'Box breadth (cm)', type: 'number', step: '0.5' },
      { name: 'heightCm', label: 'Box height (cm)', type: 'number', step: '0.5' },
    ],
    note: 'Parcel weight = sum of product weights (Settings → Shipping fallback weight for products without one). Shiprocket charges the higher of actual and volumetric weight (L×B×H ÷ 5000), so set product weights and box size for accurate charges.',
    extra: () => <ShiprocketTest />,
  },
  seo: {
    label: 'Search & sharing',
    fields: [
      { name: 'homeTitle', label: 'Homepage title', span: 2, hint: 'Up to 70 characters' },
      { name: 'homeDescription', label: 'Homepage description', type: 'textarea', rows: 2, hint: 'Up to 170 characters' },
      { name: 'ogImage', label: 'Default share image', type: 'imageurl', folder: 'seo' },
    ],
  },
  analytics: {
    label: 'Analytics',
    fields: [
      { name: 'ga4Id', label: 'Google Analytics 4 measurement ID', placeholder: 'G-XXXXXXX', hint: 'Leave empty to switch analytics off' },
      { name: 'gscVerification', label: 'Google Search Console verification code' },
    ],
  },
  social: {
    label: 'Social links',
    fields: ['instagram', 'facebook', 'youtube', 'linkedin', 'googleBusiness'].map((k) => ({ name: k, label: k === 'googleBusiness' ? 'Google Business profile' : k.charAt(0).toUpperCase() + k.slice(1), placeholder: 'https://' })),
  },
  notifications: {
    label: 'Staff notifications',
    fields: [
      { name: 'adminEmails', label: 'Send alerts to', type: 'list', span: 2, hint: 'Comma separated, up to 10' },
      { name: 'fromName', label: 'Email sender name' },
      { name: 'notifyOnNewOrder', label: 'New paid order', type: 'checkbox' },
      { name: 'notifyOnReturn', label: 'Return or cancellation request', type: 'checkbox' },
      { name: 'notifyOnGrievance', label: 'New grievance', type: 'checkbox' },
      { name: 'notifyOnLowStock', label: 'Low stock', type: 'checkbox' },
    ],
  },
  reviews: {
    label: 'Reviews',
    fields: [
      { name: 'enabled', label: 'Allow product reviews', type: 'checkbox' },
      { name: 'requireVerifiedPurchase', label: 'Only customers who received the product', type: 'checkbox' },
      { name: 'autoApprove', label: 'Publish without moderation', type: 'checkbox', hint: 'Not recommended' },
    ],
  },
};

export default function SettingsPage() {
  const can = useCan();
  const [state, set] = useUrlState({ group: 'business' });
  const { data, isLoading } = useQuery({ queryKey: ['/settings'], queryFn: () => api('/settings') });
  const group = GROUPS[state.group] ? state.group : 'business';

  return (
    <Guard perm="settings:read">
      <PageHeader title="Store settings" description="Changes apply to the storefront within a minute and are recorded in the audit log." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings groups" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {Object.entries(GROUPS).map(([k, g]) => (
              <li key={k}>
                <button type="button" onClick={() => set({ group: k })} className={`flex w-full items-center justify-between gap-2 whitespace-nowrap rounded px-3 py-2 text-left text-sm ${k === group ? 'bg-white font-semibold shadow-sm ring-1 ring-stone-300' : 'text-graphite-600 hover:bg-stone-200'}`}>
                  {g.label}
                  {data?.[k]?.requiresReview ? <span className="h-2 w-2 rounded-full bg-caution" aria-label="Needs review" /> : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {isLoading || !data ? <div className="skeleton h-64" /> : <GroupForm key={group + (data[group]?.updatedAt || '')} k={group} g={GROUPS[group]} entry={data[group]} writable={can('settings:write')} />}
      </div>
    </Guard>
  );
}

function GroupForm({ k, g, entry, writable }) {
  const form = useForm({ defaultValues: toFormValues(g.fields, entry?.value || {}) });
  const [markReviewed, setMarkReviewed] = useState(false);
  const save = useAction((v) => api(`/settings/${k}`, { method: 'PUT', body: { value: { ...(entry?.value || {}), ...toBody(g.fields, v), ...emptyStrings(g.fields, v) }, markReviewed } }), {
    invalidate: ['/settings', 'system-status'],
    success: 'Settings saved',
    onError: (err) => applyFieldErrors(err, form.setError, 'value.') && false,
  });

  return (
    <Card title={g.label} actions={entry?.requiresReview ? <Pill tone="caution">Needs review</Pill> : entry?.updatedAt ? <span className="text-xs text-graphite-400">Saved {dateTime(entry.updatedAt)}</span> : null}>
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="space-y-5">
        {g.help ? <p className="text-sm text-graphite-600">{g.help}</p> : null}
        {entry?.requiresReview && entry.reviewNote ? <Notice tone="caution" title="Not yet confirmed by the business">{entry.reviewNote}</Notice> : null}
        {g.note ? <Notice tone="info">{g.note}</Notice> : null}
        <fieldset disabled={!writable}>
          <FieldSet fields={g.fields} form={form} />
        </fieldset>
        {g.extra ? g.extra() : null}
        {writable ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-300 pt-4">
            {entry?.requiresReview ? <Checkbox label="I have confirmed these details are correct" checked={markReviewed} onChange={(e) => setMarkReviewed(e.target.checked)} /> : <span />}
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null} Save
            </button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

/** Optional text fields cleared by the admin are sent as '' so they actually clear. */
function emptyStrings(fields, v) {
  const out = {};
  for (const f of fields) if ((!f.type || f.type === 'textarea') && !f.required && v[f.name] === '') out[f.name] = '';
  return out;
}

/** Checks the Shiprocket login, lists pickup locations and shows live rates for a PIN code. */
function ShiprocketTest() {
  const [pincode, setPincode] = useState('110001');
  const [weightKg, setWeightKg] = useState('1');
  const test = useAction(() => api('/settings/shiprocket/test', { method: 'POST', body: { pincode, weightKg: Number(weightKg) || 1 } }));
  const d = test.data;
  return (
    <div className="space-y-3 rounded border border-stone-300 bg-paper p-4">
      <p className="text-sm font-semibold">Test the connection</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-graphite-600">Deliver to PIN code</span>
          <input className="input w-32" inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-graphite-600">Weight (kg)</span>
          <input className="input w-24" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
        </label>
        <button type="button" className="btn-outline" disabled={test.isPending || pincode.length !== 6} onClick={() => test.mutate()}>
          {test.isPending ? <Spinner /> : null} Check rates
        </button>
      </div>
      <p className="text-xs text-graphite-400">Uses the saved settings — save first if you changed anything above.</p>
      {d ? (
        <div className="space-y-3 text-sm">
          {d.message ? <Notice tone="caution">{d.message}</Notice> : <Notice tone="okay">Shiprocket login OK. Rates from {d.pickupPincode} to {pincode}:</Notice>}
          {Array.isArray(d.locations) && d.locations.length ? (
            <p className="text-graphite-600">
              Pickup locations in your Shiprocket account: {d.locations.map((l) => `${l.name} (${l.pincode})`).join(', ')}
            </p>
          ) : null}
          {d.couriers?.length ? (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-graphite-400">
                <tr>
                  <th className="py-1 font-medium">Courier</th>
                  <th className="py-1 font-medium">Days</th>
                  <th className="py-1 text-right font-medium">Charge to customer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {d.couriers
                  .slice()
                  .sort((a, b) => a.charge - b.charge)
                  .slice(0, 12)
                  .map((c) => (
                    <tr key={c.courierId} className={d.options?.some((o) => o.courierId === c.courierId) ? 'font-semibold' : ''}>
                      <td className="py-1.5">{c.courierName}</td>
                      <td className="py-1.5">{c.days || '—'}</td>
                      <td className="py-1.5 text-right tabular-nums">₹{(c.charge / 100).toFixed(2)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : null}
          {d.options?.length ? <p className="text-xs text-graphite-400">Bold rows are what customers will be offered.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
