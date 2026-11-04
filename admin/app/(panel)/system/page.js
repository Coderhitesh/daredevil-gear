'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/hooks';
import { humanize } from '@/lib/format';
import { PageHeader, Card, Pill, Spinner } from '@/components/ui';
import Guard from '@/components/shell/Guard';

function Item({ done, warn, title, children, href, cta = 'Fix' }) {
  const Icon = done ? CheckCircle2 : warn ? AlertTriangle : Circle;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${done ? 'text-okay' : warn ? 'text-caution' : 'text-stone-400'}`} aria-label={done ? 'Done' : 'Open'} />
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${done ? 'text-graphite-400' : ''}`}>{title}</p>
        {children ? <div className="mt-0.5 text-sm text-graphite-600">{children}</div> : null}
      </div>
      {!done && href ? (
        <Link href={href} className="btn-outline btn-xs shrink-0">
          {cta}
        </Link>
      ) : null}
    </li>
  );
}

export default function SystemPage() {
  const can = useCan();
  const { data: s, isLoading } = useQuery({ queryKey: ['system-status'], queryFn: () => api('/system/status') });
  const { data: p } = useQuery({ queryKey: ['products-summary'], queryFn: () => api('/products/summary') });
  const { data: pages } = useQuery({ queryKey: ['/pages', 'all'], queryFn: () => api('/pages', { query: { limit: 200 } }).then((r) => r.data) });
  const { data: rates } = useQuery({ queryKey: ['/shipping/rates'], queryFn: () => api('/shipping/rates', { query: { limit: 200 } }).then((r) => r.data) });
  const { data: admins } = useQuery({ queryKey: ['/admins'], queryFn: () => api('/admins'), enabled: can('admins:manage') });

  if (isLoading || !s) return <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div>;
  const pendingPages = (pages || []).filter((x) => x.requiresReview);
  const pendingRates = (rates || []).filter((x) => x.requiresReview && x.isActive !== false);
  const noMfa = (admins || []).filter((a) => a.status === 'active' && !a.mfaEnabled);
  const i = s.integrations;
  const live = i.razorpay === 'live';

  return (
    <Guard perm="settings:read">
      <PageHeader title="Launch checklist" description={`Environment: ${s.environment}. Work through every item before taking real orders. Items marked done are checked live from the system.`} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Business & legal" bodyClass="">
          <ul className="divide-y divide-stone-200">
            {['business', 'grievanceOfficer'].map((k) => {
              const pending = s.pendingReview.find((x) => x.key === k);
              return (
                <Item key={k} done={!pending} title={k === 'business' ? 'Legal name, CIN, GSTIN and registered address confirmed' : 'Grievance officer named with contact details'} href={`/settings?group=${k}`}>
                  {pending?.reviewNote}
                </Item>
              );
            })}
            <Item done={!pendingPages.length} title="Policy pages reviewed by a legal adviser" href="/content/pages">
              {pendingPages.length ? `${pendingPages.length} pending: ${pendingPages.map((x) => x.title).join(', ')}` : null}
            </Item>
            <Item done={s.taxReviewed} title="GST rules confirmed by your chartered accountant" href="/settings/tax" />
            {s.pendingReview.filter((x) => !['business', 'grievanceOfficer'].includes(x.key)).map((x) => (
              <Item key={x.key} title={`${humanize(x.key)} settings confirmed`} href={`/settings?group=${x.key}`}>
                {x.reviewNote}
              </Item>
            ))}
          </ul>
        </Card>
        <Card title="Payments, email & storage" bodyClass="">
          <ul className="divide-y divide-stone-200">
            <Item done={Boolean(i.razorpay)} warn={i.razorpay === 'test'} title={i.razorpay ? `Razorpay connected (${i.razorpay} mode)` : 'Razorpay keys added'}>
              {i.razorpay === 'test' ? 'Test mode takes no real money. Switch to live keys only after a full test order, refund and webhook check.' : !i.razorpay ? 'Checkout cannot take payments until RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set on the API.' : null}
            </Item>
            <Item done={i.razorpayWebhook} title="Razorpay webhook secret set">Webhook URL: https://your-domain/api/v1/webhooks/razorpay — events payment.captured, payment.failed, order.paid, refund.processed, refund.failed.</Item>
            <Item done={i.smtp} title="SMTP email configured">{!i.smtp ? 'Without it, sign-up codes and order emails are not delivered.' : null}</Item>
            <Item done={i.cloudinary} title="Cloudinary image storage configured">{!i.cloudinary ? 'Needed to upload product photos and banners.' : null}</Item>
            <Item done={i.redis} warn={!i.redis} title="Redis job queue connected">{!i.redis ? 'Emails and jobs run inline. Recommended for production.' : null}</Item>
            <Item done={i.shippingProvider !== 'manual'} warn title={`Shipping: ${i.shippingProvider === 'manual' ? 'manual tracking entry' : i.shippingProvider}`}>Manual works; connect Shiprocket to book pickups from the order page.</Item>
            <Item done={i.sentry} warn={!i.sentry} title="Error monitoring (Sentry)" />
            <Item done={s.mfaRequired} title="Two-factor required for all admins" />
          </ul>
        </Card>
        <Card title="Catalogue" bodyClass="">
          <ul className="divide-y divide-stone-200">
            <Item done={p && !p.blocking} title="No products with blocking compliance flags" href="/products?flags=blocking" cta="Review">
              {p?.blocking ? `${p.blocking} products are held back until claims are evidenced or removed.` : null}
            </Item>
            <Item done={p && !p.missingImages} warn title="Real photos on every product" href="/products" cta="Open">
              {p?.missingImages ? `${p.missingImages} products have no photo.` : null}
            </Item>
            <Item done={p && !p.missingStatutory} warn title="Legal Metrology declarations complete" href="/products" cta="Open">
              {p?.missingStatutory ? `${p.missingStatutory} products miss origin, manufacturer/packer, net quantity, consumer care or HSN.` : null}
            </Item>
            <Item done={p && !p.outOfStock} warn title="Stock entered for published products" href="/inventory?low=true" cta="Inventory">
              {p?.outOfStock ? `${p.outOfStock} published products show as out of stock.` : null}
            </Item>
            <Item done={!pendingRates.length} title="Delivery rates confirmed with the courier" href="/settings/shipping">
              {pendingRates.length ? `${pendingRates.length} active rate(s) still marked to confirm.` : null}
            </Item>
          </ul>
        </Card>
        <Card title="Access" bodyClass="">
          <ul className="divide-y divide-stone-200">
            {can('admins:manage') ? (
              <Item done={!noMfa.length} title="Every active admin has two-factor on" href="/settings/admins">
                {noMfa.length ? noMfa.map((a) => a.email).join(', ') : null}
              </Item>
            ) : null}
            <Item done={false} warn title="Seed admin password changed" href="/account" cta="My account">
              The first super admin password came from the server environment. Change it, then remove SUPER_ADMIN_PASSWORD from the server.
            </Item>
            <Item done={live} warn title="Final test: place, pay, ship, refund one real order">
              {live ? 'Live mode is on.' : 'Do this in Razorpay live mode with a small amount before announcing the launch.'}
            </Item>
          </ul>
          <p className="border-t border-stone-200 px-4 py-3 text-xs text-graphite-400">
            Integrations: <Pill tone={i.razorpay ? 'okay' : 'alert'}>Razorpay</Pill> <Pill tone={i.smtp ? 'okay' : 'alert'}>SMTP</Pill> <Pill tone={i.cloudinary ? 'okay' : 'alert'}>Cloudinary</Pill> <Pill tone={i.redis ? 'okay' : 'caution'}>Redis</Pill>
          </p>
        </Card>
      </div>
    </Guard>
  );
}
