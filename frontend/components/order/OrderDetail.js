'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Truck } from 'lucide-react';
import { api } from '@/lib/api-client';
import { inr, date, dateTime } from '@/lib/format';
import StatusBadge from '../ui/StatusBadge';
import ProductThumb from '../product/ProductThumb';
import OrderSummary from '../cart/OrderSummary';
import ReturnForm from './ReturnForm';
import { pay } from '@/lib/razorpay';
import { useUi } from '@/lib/store';

export default function OrderDetail({ order, token }) {
  const qc = useQueryClient();
  const notify = useUi((s) => s.notify);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [returning, setReturning] = useState(false);
  const headers = token ? { 'x-ddg-order-token': token } : {};
  const refresh = () => qc.invalidateQueries({ queryKey: ['order', order.orderNumber] });

  const cancel = async (e) => {
    e.preventDefault();
    try {
      const res = await api(`/orders/${order.orderNumber}/cancel`, { method: 'POST', body: { reason }, headers });
      notify(res.cancellationRequested ? 'Cancellation requested — we will confirm by email.' : 'Order cancelled. Your refund has been initiated.', 'good');
      setCancelling(false);
      refresh();
    } catch (err) {
      notify(err.message, 'bad');
    }
  };

  const payNow = async () => {
    try {
      const p = await api(`/checkout/orders/${order.orderNumber}/pay`, { method: 'POST', headers });
      const response = await pay(p.razorpay);
      await api('/payments/razorpay/verify', { method: 'POST', body: response });
      notify('Payment received. Thank you!', 'good');
      refresh();
    } catch (err) {
      if (!err?.dismissed) notify(err?.error?.description || err.message || 'Payment did not complete', 'bad');
    }
  };

  const s = order.shipment;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-display-md">Order {order.orderNumber}</h2>
          <p className="text-graphite">Placed {dateTime(order.placedAt || order.createdAt)}</p>
        </div>
        <StatusBadge status={order.status} label={order.statusLabel} />
      </div>

      {order.canPay ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded bg-signal-light p-4">
          <p>This order is waiting for payment. Your items are held for a short time.</p>
          <button type="button" className="btn-primary btn-sm" onClick={payNow}>
            Pay {inr(order.pricing.grandTotal)}
          </button>
        </div>
      ) : null}

      {s ? (
        <section className="panel p-5">
          <h3 className="flex items-center gap-2 font-display text-xl">
            <Truck size={20} /> Shipment
          </h3>
          <p className="mt-2 text-graphite">
            {s.carrier ? `${s.carrier}, ` : ''}tracking number <strong className="text-ink">{s.trackingNumber}</strong>
            {s.trackingUrl ? (
              <>
                {' '}
                <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="link">
                  Track on carrier site
                </a>
              </>
            ) : null}
          </p>
          {s.events?.length ? (
            <ol className="mt-4 space-y-3 border-l-2 border-stone-300 pl-5">
              {[...s.events].reverse().map((e, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ${i === 0 ? 'bg-signal' : 'bg-stone-400'}`} aria-hidden="true" />
                  <p className="font-medium capitalize">{String(e.status).replace(/_/g, ' ')}</p>
                  <p className="text-sm text-graphite">
                    {dateTime(e.at)}
                    {e.location ? `, ${e.location}` : ''}
                    {e.note ? ` — ${e.note}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      <section className="panel p-5">
        <h3 className="font-display text-xl">Items</h3>
        <ul className="mt-3 divide-y divide-stone-300">
          {order.items.map((i) => (
            <li key={i.id} className="flex gap-4 py-3">
              <ProductThumb image={i.image ? { url: i.image } : null} name={i.name} size={64} />
              <div className="min-w-0 flex-1">
                {i.slug ? (
                  <Link href={`/product/${i.slug}`} className="font-medium hover:underline">
                    {i.name}
                  </Link>
                ) : (
                  <p className="font-medium">{i.name}</p>
                )}
                <p className="text-sm text-graphite">
                  SKU {i.sku}, quantity {i.quantity}, GST {i.gstRate}% included
                </p>
                {i.quantityReturned ? <p className="text-sm text-graphite">{i.quantityReturned} returned</p> : null}
              </div>
              <p className="tabular">{inr(i.netTotal)}</p>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-stone-300 pt-4">
          <OrderSummary totals={{ ...order.pricing, shippingKnown: true }} shippingLabel={order.delivery?.label} payOnDelivery={order.payment?.provider === 'cod' && order.payment?.status === 'cod_pending'} />
        </div>
        {order.payment?.provider === 'cod' ? (
          <p className="mt-3 text-sm text-graphite">
            {order.payment.status === 'cod_pending' ? `Cash on delivery: please keep ${inr(order.pricing.grandTotal)} ready (cash or UPI) for the courier.` : order.status === 'cancelled' ? 'Cash on delivery order — nothing was charged.' : 'Cash on delivery — paid to the courier.'}
          </p>
        ) : null}
        {order.payment?.amountRefunded ? <p className="mt-3 text-sm text-okay">Refunded so far: {inr(order.payment.amountRefunded)}</p> : null}
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="panel p-5">
          <h3 className="font-display text-xl">Delivery address</h3>
          <address className="mt-2 not-italic text-graphite">
            {order.shippingAddress.fullName}
            <br />
            {order.shippingAddress.line1}
            {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}
            <br />
            {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pincode}
            <br />
            {order.shippingAddress.phone}
          </address>
        </section>
        <section className="panel p-5">
          <h3 className="font-display text-xl">History</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {order.history?.map((h, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>{h.label}</span>
                <span className="text-graphite-400">{date(h.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {order.returns?.length ? (
        <section className="panel p-5">
          <h3 className="font-display text-xl">Returns</h3>
          <ul className="mt-2 space-y-2">
            {order.returns.map((r) => (
              <li key={r.requestNumber} className="text-[15px]">
                <strong>{r.requestNumber}</strong>, {r.reason}: <span className="capitalize">{r.status.replace(/_/g, ' ')}</span>
                {r.adminNotes ? <span className="block text-sm text-graphite">{r.adminNotes}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {order.invoiceAvailable ? (
          <a href={`/api/v1/orders/${order.orderNumber}/invoice${token ? `?t=${encodeURIComponent(token)}` : ''}`} target="_blank" rel="noopener" className="btn-outline btn-sm">
            <FileText size={16} /> Tax invoice
          </a>
        ) : null}
        {order.canCancel ? (
          <button type="button" className="btn-outline btn-sm" onClick={() => setCancelling(!cancelling)}>
            Cancel order
          </button>
        ) : null}
        {order.canReturn && !token ? (
          <button type="button" className="btn-outline btn-sm" onClick={() => setReturning(!returning)}>
            Return or report a problem
          </button>
        ) : null}
        <Link href="/pages/grievance-redressal" className="btn-ghost btn-sm">
          Raise a complaint
        </Link>
      </div>

      {cancelling ? (
        <form onSubmit={cancel} className="panel space-y-3 p-5">
          <label htmlFor="cancel-reason" className="field-label">
            Why are you cancelling?
          </label>
          <select id="cancel-reason" className="input" required value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a reason</option>
            <option>Ordered by mistake</option>
            <option>Found a better price elsewhere</option>
            <option>Delivery is taking too long</option>
            <option>Need to change the address or items</option>
            <option>Other</option>
          </select>
          <p className="text-sm text-graphite">{order.status === 'processing' ? 'Your order is being packed, so we will review your request and confirm by email.' : order.payment?.provider === 'cod' ? 'Nothing has been charged for this cash-on-delivery order.' : 'You will receive a full refund to your original payment method.'}</p>
          <button type="submit" className="btn-dark btn-sm" disabled={!reason}>
            Confirm cancellation
          </button>
        </form>
      ) : null}

      {returning ? <ReturnForm order={order} onDone={() => (setReturning(false), refresh())} /> : null}
    </div>
  );
}
