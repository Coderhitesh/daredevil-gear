'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, FileText, Truck, Ban, Undo2, RefreshCw, Mail, ArrowRightLeft, Copy } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useCan } from '@/lib/hooks';
import { inr, dateTime, humanize, paymentMethod, ORDER_STATUS_LABEL } from '@/lib/format';
import { PageHeader, Card, Status, Pill, KeyValue, Spinner, Notice, Textarea, Select, Empty } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import Guard from '@/components/shell/Guard';
import { StatusDialog, ShipDialog, ShipmentUpdateDialog, CancelDialog, RefundDialog, ReturnDialog } from '@/components/order/dialogs';

const CANCELLABLE = ['pending_payment', 'payment_failed', 'confirmed', 'processing', 'cancellation_requested'];

export default function OrderPage({ params }) {
  const { id } = use(params);
  const { data: order, isLoading, error } = useQuery({ queryKey: ['order', id], queryFn: () => api(`/orders/${id}`) });
  if (isLoading || !order) return <div className="flex justify-center py-20">{error ? <p className="text-alert">{error.message}</p> : <Spinner className="h-6 w-6" />}</div>;
  return (
    <Guard perm="orders:read">
      <OrderView order={order} />
    </Guard>
  );
}

function Address({ a }) {
  if (!a) return <span className="text-graphite-400">—</span>;
  return (
    <address className="text-sm not-italic leading-relaxed">
      <strong>{a.fullName}</strong>
      {a.companyName ? <>, {a.companyName}</> : null}
      <br />
      {a.line1}
      {a.line2 ? `, ${a.line2}` : ''}
      {a.landmark ? <><br />Near {a.landmark}</> : null}
      <br />
      {a.city}, {a.state} {a.pincode}
      <br />
      {a.phone}
      {a.gstin ? <><br />GSTIN {a.gstin}</> : null}
    </address>
  );
}

function OrderView({ order }) {
  const can = useCan();
  const [dialog, setDialog] = useState(null);
  const [returnReq, setReturnReq] = useState(null);
  const [note, setNote] = useState('');
  const [template, setTemplate] = useState('order_confirmation');
  const invalidate = [['order', order._id], '/orders'];
  const write = can('orders:write');
  const p = order.pricing || {};
  const paidStates = ['captured', 'partially_refunded', 'refunded'];
  const isPaid = paidStates.includes(order.payment?.status);

  const addNote = useAction(() => api(`/orders/${order._id}/notes`, { method: 'POST', body: { note: note.trim() } }), { invalidate, success: 'Note added', onSuccess: () => setNote('') });
  const reconcile = useAction(() => api(`/orders/${order._id}/reconcile`, { method: 'POST' }), { invalidate, success: (r) => ({ paid: 'Payment found and the order is confirmed', no_payment: 'Razorpay has no payment for this order yet', failed_attempts: 'Only failed payment attempts were found', unreachable: 'Could not reach Razorpay, try again shortly', no_rzp_order: 'No Razorpay order was created for this order' })[r.result] || `Reconciled: ${humanize(String(r.result))}` });
  const resend = useAction(() => api(`/orders/${order._id}/resend`, { method: 'POST', body: { template } }), { invalidate, success: 'Email queued' });

  const statusOptions = (order.allowedTransitions || []).filter((s) => !['cancelled', 'shipped'].includes(s));
  const canShip = order.allowedTransitions?.includes('shipped') && !order.shipmentDoc;

  return (
    <>
      <PageHeader
        back={
          <Link href="/orders" className="mb-2 inline-flex items-center gap-1 text-sm text-graphite-400 hover:text-ink">
            <ChevronLeft className="h-4 w-4" /> Orders
          </Link>
        }
        title={order.orderNumber}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Status value={order.status} label={ORDER_STATUS_LABEL[order.status]} />
            <span>Payment</span> <Status value={order.payment?.status} label={order.payment?.status === 'cod_pending' ? 'COD — to collect' : undefined} />
            <span className="text-graphite-400">Placed {dateTime(order.placedAt || order.createdAt)}</span>
            {order.isGuest ? <Pill>Guest checkout</Pill> : null}
          </span>
        }
        actions={
          <>
            {isPaid ? (
              <a href={`/api/v1/admin/orders/${order._id}/invoice`} target="_blank" rel="noreferrer" className="btn-outline">
                <FileText className="h-4 w-4" /> Tax invoice
              </a>
            ) : null}
            {write && canShip ? (
              <button type="button" className="btn-primary" onClick={() => setDialog('ship')}>
                <Truck className="h-4 w-4" /> Ship order
              </button>
            ) : null}
            {write && statusOptions.length ? (
              <button type="button" className="btn-dark" onClick={() => setDialog('status')}>
                <ArrowRightLeft className="h-4 w-4" /> Change status
              </button>
            ) : null}
            {write && can('refunds:write') && CANCELLABLE.includes(order.status) ? (
              <button type="button" className="btn-danger" onClick={() => setDialog('cancel')}>
                <Ban className="h-4 w-4" /> Cancel
              </button>
            ) : null}
          </>
        }
      />

      {order.status === 'cancellation_requested' ? (
        <div className="mb-4">
          <Notice tone="caution" title="The customer asked to cancel" action={write ? <button type="button" className="btn-danger btn-xs" onClick={() => setDialog('cancel')}>Approve cancellation</button> : null}>
            {order.cancellation?.reason || 'No reason given.'} To refuse, change the status back to Processing.
          </Notice>
        </div>
      ) : null}
      {order.payment?.status === 'created' && order.status === 'pending_payment' ? (
        <div className="mb-4">
          <Notice tone="info" title="Awaiting payment" action={write ? <button type="button" className="btn-outline btn-xs" onClick={() => reconcile.mutate()} disabled={reconcile.isPending}>{reconcile.isPending ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />} Check with Razorpay</button> : null}>
            Stock is held until {dateTime(order.expiresAt)}. If the customer paid but the order did not update, check with Razorpay to confirm it.
          </Notice>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Card title={`Items (${order.items.reduce((s, i) => s + i.quantity, 0)})`} bodyClass="">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>HSN</th>
                    <th className="text-right">Unit (incl. GST)</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">GST</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i._id}>
                      <td>
                        <span className="flex items-center gap-3">
                          <span className="h-10 w-10 shrink-0 overflow-hidden rounded bg-stone-200">{i.image ? <img src={i.image} alt="" className="h-full w-full object-cover" /> : null}</span>
                          <span>
                            {i.product ? <Link href={`/products/${i.product}`} className="link">{i.name}</Link> : i.name}
                            <span className="block text-xs text-graphite-400">
                              {i.sku}
                              {i.variantTitle && i.variantTitle !== 'Default' ? `, ${i.variantTitle}` : ''}
                            </span>
                            {i.quantityRefunded || i.quantityReturned || i.quantityCancelled ? (
                              <span className="text-xs text-caution">
                                {[i.quantityCancelled && `${i.quantityCancelled} cancelled`, i.quantityReturned && `${i.quantityReturned} returned`, i.quantityRefunded && `${i.quantityRefunded} refunded`].filter(Boolean).join(', ')}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td className="text-xs">{i.hsnCode || <span className="text-caution">missing</span>}</td>
                      <td className="text-right tabular">
                        {inr(i.unitPriceInclusive)}
                        {i.regularUnitPriceInclusive && i.regularUnitPriceInclusive > i.unitPriceInclusive ? <s className="block text-xs text-graphite-400">{inr(i.regularUnitPriceInclusive)}</s> : null}
                      </td>
                      <td className="text-right tabular">{i.quantity}</td>
                      <td className="text-right tabular">
                        {i.gstRate}%<span className="block text-xs text-graphite-400">{inr(i.taxAmount)}</span>
                      </td>
                      <td className="text-right tabular">
                        {inr(i.netTotal)}
                        {i.discount ? <span className="block text-xs text-okay">−{inr(i.discount)} coupon</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-1 gap-4 border-t border-stone-300 p-4 sm:grid-cols-2">
              <div className="text-xs text-graphite-600">
                <p className="font-medium text-graphite">GST breakup ({p.supplyType === 'intra' ? 'CGST + SGST, within Uttar Pradesh' : 'IGST, inter-state'})</p>
                <table className="mt-1 w-full">
                  <tbody>
                    {(p.taxBreakup || []).map((t) => (
                      <tr key={t.rate}>
                        <td>{t.rate}% on {inr(t.taxable)}</td>
                        <td className="text-right tabular">{inr(t.tax)}</td>
                      </tr>
                    ))}
                    {p.supplyType === 'intra' ? (
                      <tr className="text-graphite-400">
                        <td>CGST {inr(p.cgst)} + SGST {inr(p.sgst)}</td>
                        <td />
                      </tr>
                    ) : (
                      <tr className="text-graphite-400">
                        <td>IGST {inr(p.igst)}</td>
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <dl className="space-y-1 text-sm">
                <Row k="Items (incl. GST)" v={inr(p.itemsTotal)} />
                {(p.offers || []).map((o) => (
                  <Row key={o.offerId} k={`Offer: ${o.name}${o.times > 1 ? ` ×${o.times}` : ''}`} v={`−${inr(o.saving)}`} />
                ))}
                {p.discount ? <Row k={`Coupon ${p.couponCode || ''}`} v={`−${inr(p.discount)}`} /> : null}
                <Row k="Packaging" v={inr(p.packagingCharge)} />
                <Row k={`Delivery${order.delivery?.label ? ` (${order.delivery.label})` : ''}`} v={p.shippingCharge ? inr(p.shippingCharge) : 'Free'} />
                {p.codCharge ? <Row k="Cash on delivery fee" v={inr(p.codCharge)} /> : null}
                <Row k="Total GST included" v={inr(p.taxTotal)} muted />
                <div className="flex justify-between border-t border-stone-300 pt-1.5 font-semibold">
                  <dt>Grand total</dt>
                  <dd className="tabular">{inr(p.grandTotal)}</dd>
                </div>
                {order.payment?.amountRefunded ? <Row k="Refunded" v={`−${inr(order.payment.amountRefunded)}`} /> : null}
              </dl>
            </div>
          </Card>

          <Card
            title="Payment"
            actions={
              write && order.payment?.razorpayOrderId ? (
                <button type="button" className="btn-ghost btn-xs" onClick={() => reconcile.mutate()} disabled={reconcile.isPending}>
                  {reconcile.isPending ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />} Reconcile
                </button>
              ) : null
            }
          >
            {order.payment?.provider === 'cod' ? (
              <Notice tone={order.payment.status === 'cod_pending' ? 'caution' : 'info'}>
                {order.payment.status === 'cod_pending'
                  ? `Cash on delivery: the courier collects ${inr(order.pricing.grandTotal)}. The payment is recorded as collected when you mark the order delivered.`
                  : 'Cash on delivery. Refunds are paid by bank transfer / UPI; record the reference when you refund.'}
              </Notice>
            ) : null}
            <KeyValue
              rows={[
                ['Status', <Status key="s" value={order.payment?.status} label={order.payment?.status === 'cod_pending' ? 'To collect on delivery' : undefined} />],
                ['Method', paymentMethod(order.payment?.method)],
                order.pricing?.codCharge ? ['COD fee', inr(order.pricing.codCharge)] : null,
                ['Paid', order.payment?.amountPaid ? `${inr(order.payment.amountPaid)} on ${dateTime(order.payment.paidAt)}` : '—'],
                order.payment?.provider === 'cod' ? null : ['Razorpay order', order.payment?.razorpayOrderId ? <CopyText key="o" text={order.payment.razorpayOrderId} /> : '—'],
                order.payment?.provider === 'cod' ? null : ['Razorpay payment', order.payment?.razorpayPaymentId ? <CopyText key="p" text={order.payment.razorpayPaymentId} /> : '—'],
                ['Refundable now', inr(order.refundable)],
              ]}
            />
            {order.payments?.length > 1 ? (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-graphite-600">{order.payments.length} payment attempts</summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {order.payments.map((x) => (
                    <li key={x._id} className="flex justify-between gap-2">
                      <span>{x.razorpayPaymentId || x.razorpayOrderId}</span>
                      <span>
                        <Status value={x.status} /> {dateTime(x.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {can('refunds:write') && order.refundable > 0 && !CANCELLABLE.includes(order.status) ? (
              <button type="button" className="btn-outline mt-4" onClick={() => setDialog('refund')}>
                <Undo2 className="h-4 w-4" /> Issue refund
              </button>
            ) : null}
            {order.refunds?.length ? (
              <div className="mt-4 border-t border-stone-200 pt-3">
                <p className="mb-2 text-sm font-medium">Refunds</p>
                <ul className="space-y-2 text-sm">
                  {order.refunds.map((r) => (
                    <li key={r._id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {inr(r.amount)} <span className="text-graphite-400">— {r.reason}</span>
                        <span className="block text-xs text-graphite-400">
                          {dateTime(r.createdAt)} by {r.initiatedBy?.name || 'system'}
                          {r.razorpayRefundId ? `, ${r.razorpayRefundId}` : ''}
                        </span>
                      </span>
                      <Status value={r.status} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          <Card title="Delivery" actions={write && order.shipmentDoc ? <button type="button" className="btn-ghost btn-xs" onClick={() => setDialog('shipment')}>Update shipment</button> : null}>
            {order.shipmentDoc ? (
              <div className="space-y-3">
                <KeyValue
                  rows={[
                    ['Courier', order.shipmentDoc.carrier],
                    ['Tracking', order.shipmentDoc.trackingUrl ? <a key="t" className="link" href={order.shipmentDoc.trackingUrl} target="_blank" rel="noreferrer">{order.shipmentDoc.trackingNumber}</a> : order.shipmentDoc.trackingNumber],
                    ['Status', <Status key="s" value={order.shipmentDoc.status} />],
                    ['Shipped', dateTime(order.shipmentDoc.shippedAt)],
                    order.shipmentDoc.deliveredAt ? ['Delivered', dateTime(order.shipmentDoc.deliveredAt)] : null,
                  ]}
                />
                {order.shipmentDoc.events?.length ? (
                  <ol className="border-l-2 border-stone-300 pl-4 text-xs">
                    {[...order.shipmentDoc.events].reverse().map((e, i) => (
                      <li key={i} className="mb-2">
                        <span className="font-medium">{humanize(e.status)}</span>
                        {e.location ? `, ${e.location}` : ''} {e.note ? `— ${e.note}` : ''}
                        <span className="block text-graphite-400">{dateTime(e.at)}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-graphite-600">
                {order.delivery?.label || 'Standard delivery'}
                {order.delivery?.etd ? `, estimated by ${order.delivery.etd}` : order.delivery?.estimatedDays?.max ? `, usually ${order.delivery.estimatedDays.min && order.delivery.estimatedDays.min !== order.delivery.estimatedDays.max ? `${order.delivery.estimatedDays.min}–` : ''}${order.delivery.estimatedDays.max} days` : ''}. Not shipped yet.
              </p>
            )}
          </Card>

          {order.shippingProvider === 'shiprocket' || order.shiprocket?.orderId ? <ShiprocketCard order={order} write={write} /> : null}

          {order.returns?.length ? (
            <Card title="Returns" bodyClass="">
              <ul className="divide-y divide-stone-200">
                {order.returns.map((r) => (
                  <li key={r._id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span>
                      <span className="font-medium">{r.requestNumber}</span> — {humanize(r.type)}: {r.reason}
                      <span className="block text-xs text-graphite-400">{r.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Status value={r.status} />
                      {write && !['refunded', 'closed', 'rejected'].includes(r.status) ? (
                        <button type="button" className="btn-outline btn-xs" onClick={() => setReturnReq(r)}>
                          Process
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="Timeline" bodyClass="">
            <ol className="divide-y divide-stone-200">
              {[...(order.statusHistory || [])].reverse().map((h, i) => (
                <li key={i} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                  <span>
                    {h.from ? `${ORDER_STATUS_LABEL[h.from] || h.from} to ` : ''}
                    <strong>{ORDER_STATUS_LABEL[h.to] || h.to}</strong>
                    {h.note ? <span className="text-graphite-600"> — {h.note}</span> : null}
                  </span>
                  <span className="shrink-0 text-right text-xs text-graphite-400">
                    {dateTime(h.at)}
                    <span className="block">{h.byName || humanize(h.byRole || 'system')}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title="Customer">
            <p className="font-medium">{order.customerName}</p>
            <p className="text-sm">
              <a className="link" href={`mailto:${order.email}`}>{order.email}</a>
            </p>
            <p className="text-sm">{order.phone}</p>
            {order.user ? (
              <Link href={`/customers/${order.user._id}`} className="link mt-2 inline-block text-sm">
                View customer account
              </Link>
            ) : (
              <p className="mt-2 text-xs text-graphite-400">Guest checkout, no account</p>
            )}
            {order.ageConfirmedAt ? <p className="mt-2 text-xs text-graphite-600">Confirmed 18+ at checkout on {dateTime(order.ageConfirmedAt)}</p> : null}
          </Card>
          <Card title="Ship to">
            <Address a={order.shippingAddress} />
          </Card>
          <Card title="Bill to">
            <Address a={order.billingAddress || order.shippingAddress} />
            {order.invoice?.number ? <p className="mt-2 text-xs text-graphite-600">Invoice {order.invoice.number}</p> : null}
          </Card>
          <Card title="Internal notes">
            <ul className="mb-3 space-y-2">
              {(order.internalNotes || []).map((n, i) => (
                <li key={i} className="rounded bg-stone-200 px-3 py-2 text-sm">
                  {n.note}
                  <span className="mt-0.5 block text-xs text-graphite-400">
                    {n.byName}, {dateTime(n.at)}
                  </span>
                </li>
              ))}
            </ul>
            <Textarea rows={2} label="Add a note" value={note} onChange={(e) => setNote(e.target.value)} hint="Only staff can see this" />
            <button type="button" className="btn-outline btn-xs mt-2" disabled={note.trim().length < 2 || addNote.isPending} onClick={() => addNote.mutate()}>
              Add note
            </button>
          </Card>
          {write ? (
            <Card title="Emails">
              <div className="flex gap-2">
                <Select className="flex-1" aria-label="Email to resend" value={template} onChange={(e) => setTemplate(e.target.value)} options={[['order_confirmation', 'Order confirmation'], ['shipment_dispatched', 'Dispatch notice'], ['order_delivered', 'Delivered']]} />
                <button type="button" className="btn-outline self-start" onClick={() => resend.mutate()} disabled={resend.isPending}>
                  <Mail className="h-4 w-4" /> Resend
                </button>
              </div>
              {order.emailLog?.length ? (
                <ul className="mt-3 space-y-1 text-xs">
                  {order.emailLog.slice(0, 8).map((e) => (
                    <li key={e._id} className="flex justify-between gap-2">
                      <span>{humanize(e.template)}</span>
                      <span className="flex items-center gap-1.5">
                        <Status value={e.status} /> {dateTime(e.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="No emails logged" />
              )}
            </Card>
          ) : null}
        </aside>
      </div>

      {dialog === 'status' ? <StatusDialog order={order} onClose={() => setDialog(null)} /> : null}
      {dialog === 'ship' ? <ShipDialog order={order} onClose={() => setDialog(null)} /> : null}
      {dialog === 'shipment' ? <ShipmentUpdateDialog order={order} onClose={() => setDialog(null)} /> : null}
      {dialog === 'cancel' ? <CancelDialog order={order} onClose={() => setDialog(null)} /> : null}
      {dialog === 'refund' ? <RefundDialog order={order} onClose={() => setDialog(null)} /> : null}
      {returnReq ? <ReturnDialog order={order} request={returnReq} onClose={() => setReturnReq(null)} /> : null}
    </>
  );
}

function Row({ k, v, muted }) {
  return (
    <div className={`flex justify-between ${muted ? 'text-graphite-400' : ''}`}>
      <dt>{k}</dt>
      <dd className="tabular">{v}</dd>
    </div>
  );
}

function CopyText({ text }) {
  const toast = useToast();
  return (
    <button type="button" className="inline-flex items-center gap-1 font-mono text-xs hover:underline" onClick={() => navigator.clipboard?.writeText(text).then(() => toast.show('Copied'))}>
      {text} <Copy className="h-3 w-3" />
    </button>
  );
}

const SR_LABEL = { not_sent: 'Not sent', queued: 'Queued', pushed: 'In Shiprocket', awb_assigned: 'Courier assigned', failed: 'Failed', cancelled: 'Cancelled' };
const SR_TONE = { pushed: 'okay', awb_assigned: 'okay', failed: 'alert', queued: 'signal', cancelled: 'muted', not_sent: 'caution' };

/** Shiprocket sync status, with a manual send / retry. */
function ShiprocketCard({ order, write }) {
  const sr = order.shiprocket || {};
  const status = sr.status || 'not_sent';
  const canPush = write && ['confirmed', 'processing'].includes(order.status) && ['not_sent', 'failed', 'queued'].includes(status);
  const push = useAction(() => api(`/orders/${order._id}/shiprocket/push`, { method: 'POST' }), {
    invalidate: [['order', order._id], '/orders'],
    success: (d) => (d?.status === 'failed' ? 'Shiprocket rejected the order — see the error below' : 'Order sent to Shiprocket'),
  });
  return (
    <Card
      title="Shiprocket"
      actions={
        canPush ? (
          <button type="button" className="btn-ghost btn-xs" disabled={push.isPending} onClick={() => push.mutate()}>
            {push.isPending ? <Spinner /> : <RefreshCw size={14} />} {status === 'not_sent' ? 'Send now' : 'Retry'}
          </button>
        ) : null
      }
    >
      <div className="space-y-3">
        <KeyValue
          rows={[
            ['Status', <Pill key="s" tone={SR_TONE[status]}>{SR_LABEL[status] || status}</Pill>],
            order.delivery?.courierName ? ['Quoted courier', `${order.delivery.courierName}${order.delivery.etd ? ` · ETA ${order.delivery.etd}` : ''}`] : null,
            sr.orderId ? ['Shiprocket order', sr.orderId] : null,
            sr.shipmentId ? ['Shipment ID', sr.shipmentId] : null,
            sr.awb ? ['AWB', <a key="awb" className="link" href={`https://shiprocket.co/tracking/${sr.awb}`} target="_blank" rel="noreferrer">{sr.awb}</a>] : null,
            sr.courierName && sr.courierName !== order.delivery?.courierName ? ['Courier', sr.courierName] : null,
            sr.pushedAt ? ['Sent', dateTime(sr.pushedAt)] : null,
            sr.attempts ? ['Attempts', sr.attempts] : null,
          ]}
        />
        {sr.lastError ? <Notice tone={status === 'failed' ? 'alert' : 'caution'}>{sr.lastError}</Notice> : null}
        {status === 'not_sent' && order.status === 'pending_payment' ? <p className="text-xs text-graphite-400">Sent automatically once the payment is captured.</p> : null}
        {sr.orderId ? (
          <a className="link text-sm" href="https://app.shiprocket.in/seller/orders/new" target="_blank" rel="noreferrer">
            Open Shiprocket orders
          </a>
        ) : null}
      </div>
    </Card>
  );
}
