'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { inr, toPaise, toRupees, humanize, ORDER_STATUS_LABEL } from '@/lib/format';
import { Modal, Input, Select, Textarea, Checkbox, Spinner, Notice } from '@/components/ui';

function Footer({ onClose, busy, disabled, label, tone = 'btn-dark', onClick }) {
  return (
    <>
      <button type="button" className="btn-outline" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className={tone} disabled={disabled || busy} onClick={onClick}>
        {busy ? <Spinner /> : null} {label}
      </button>
    </>
  );
}

const keys = (order) => [['order', order._id], '/orders', 'dashboard'];

export function StatusDialog({ order, onClose }) {
  const options = (order.allowedTransitions || []).filter((s) => !['cancelled', 'shipped'].includes(s));
  const [status, setStatus] = useState(options[0] || '');
  const [note, setNote] = useState('');
  const save = useAction(() => api(`/orders/${order._id}/status`, { method: 'POST', body: { status, note: note.trim() || undefined } }), { invalidate: keys(order), success: 'Order status updated', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title="Update order status" size="sm" footer={<Footer onClose={onClose} busy={save.isPending} disabled={!status} label="Update status" onClick={() => save.mutate()} />}>
      <div className="space-y-4">
        <Select label="New status" value={status} onChange={(e) => setStatus(e.target.value)} options={options.map((s) => [s, ORDER_STATUS_LABEL[s] || humanize(s)])} />
        <Textarea label="Note (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} hint="Visible in the order timeline. Delivered and out-for-delivery updates email the customer." />
      </div>
    </Modal>
  );
}

export function ShipDialog({ order, onClose }) {
  const [v, setV] = useState({ carrier: '', trackingNumber: '', trackingUrl: '', note: '' });
  const [mode, setMode] = useState('manual');
  const up = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const manual = useAction(() => api(`/orders/${order._id}/ship`, { method: 'POST', body: { carrier: v.carrier.trim(), trackingNumber: v.trackingNumber.trim(), trackingUrl: v.trackingUrl.trim(), note: v.note.trim() || undefined } }), {
    invalidate: keys(order),
    success: 'Marked as shipped. The customer has been emailed.',
    onSuccess: onClose,
  });
  const provider = useAction(() => api(`/orders/${order._id}/ship/provider`, { method: 'POST', body: {} }), { invalidate: keys(order), success: 'Shipment created with Shiprocket', onSuccess: onClose });
  const valid = v.carrier.trim().length >= 2 && v.trackingNumber.trim().length >= 3;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Ship ${order.orderNumber}`}
      footer={
        mode === 'manual' ? (
          <Footer onClose={onClose} busy={manual.isPending} disabled={!valid} label="Mark as shipped" tone="btn-primary" onClick={() => manual.mutate()} />
        ) : (
          <Footer onClose={onClose} busy={provider.isPending} label="Create Shiprocket shipment" tone="btn-primary" onClick={() => provider.mutate()} />
        )
      }
    >
      <div className="space-y-4">
        {order.shippingProvider === 'shiprocket' ? <Select label="How" value={mode} onChange={(e) => setMode(e.target.value)} options={[['manual', 'Enter courier and tracking myself'], ['provider', 'Book through Shiprocket']]} /> : null}
        {mode === 'manual' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Courier" required value={v.carrier} onChange={up('carrier')} placeholder="Delhivery, India Post…" />
            <Input label="Tracking / AWB number" required value={v.trackingNumber} onChange={up('trackingNumber')} />
            <Input label="Tracking link" className="sm:col-span-2" value={v.trackingUrl} onChange={up('trackingUrl')} placeholder="https://…" hint="Optional. Included in the dispatch email." />
            <Textarea label="Note" className="sm:col-span-2" rows={2} value={v.note} onChange={up('note')} />
          </div>
        ) : (
          <Notice tone="info">The parcel is booked with the default pickup location and the product weights on file. Check weights are correct before booking.</Notice>
        )}
        <p className="text-xs text-graphite-400">
          Ship to: {order.shippingAddress?.fullName}, {order.shippingAddress?.city}, {order.shippingAddress?.state} {order.shippingAddress?.pincode}
        </p>
      </div>
    </Modal>
  );
}

export function ShipmentUpdateDialog({ order, onClose }) {
  const s = order.shipmentDoc || {};
  const [v, setV] = useState({ status: s.status === 'shipped' ? 'in_transit' : s.status || 'in_transit', location: '', note: '', trackingNumber: s.trackingNumber || '', trackingUrl: s.trackingUrl || '', carrier: s.carrier || '' });
  const up = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const save = useAction(
    () =>
      api(`/orders/${order._id}/shipment`, {
        method: 'PATCH',
        body: { status: v.status, location: v.location.trim() || undefined, note: v.note.trim() || undefined, carrier: v.carrier.trim() || undefined, trackingNumber: v.trackingNumber.trim() || undefined, trackingUrl: v.trackingUrl.trim() || undefined },
      }),
    { invalidate: keys(order), success: 'Shipment updated', onSuccess: onClose }
  );
  return (
    <Modal open onClose={onClose} title="Update shipment" footer={<Footer onClose={onClose} busy={save.isPending} label="Save update" onClick={() => save.mutate()} />}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Status" value={v.status} onChange={up('status')} options={[['shipped', 'Shipped'], ['in_transit', 'In transit'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered'], ['rto', 'Returned to origin (RTO)']]} />
        <Input label="Location" value={v.location} onChange={up('location')} placeholder="Delhi hub" />
        <Input label="Courier" value={v.carrier} onChange={up('carrier')} />
        <Input label="Tracking number" value={v.trackingNumber} onChange={up('trackingNumber')} />
        <Input label="Tracking link" className="sm:col-span-2" value={v.trackingUrl} onChange={up('trackingUrl')} />
        <Textarea label="Note" className="sm:col-span-2" rows={2} value={v.note} onChange={up('note')} />
      </div>
    </Modal>
  );
}

export function CancelDialog({ order, onClose }) {
  const [reason, setReason] = useState('');
  const paid = (order.payment?.amountPaid || 0) - (order.payment?.amountRefunded || 0);
  const save = useAction(() => api(`/orders/${order._id}/cancel`, { method: 'POST', body: { reason: reason.trim() } }), {
    invalidate: keys(order),
    success: (r) => (r.refund ? `Order cancelled. Refund of ${inr(r.refund.amount)} initiated.` : 'Order cancelled'),
    onSuccess: onClose,
  });
  return (
    <Modal open onClose={onClose} title={`Cancel ${order.orderNumber}?`} size="sm" footer={<Footer onClose={onClose} busy={save.isPending} disabled={reason.trim().length < 3} label="Cancel order" tone="btn-danger" onClick={() => save.mutate()} />}>
      <div className="space-y-4 text-sm">
        <p>Reserved or committed stock is returned to inventory.</p>
        {paid > 0 ? <Notice tone="caution" title={`A refund of ${inr(paid)} will be issued`}>The full paid amount goes back to the original payment method through CCAvenue. Banks usually take 5–7 working days.</Notice> : null}
        <Textarea label="Reason" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} hint="Included in the cancellation email to the customer." />
      </div>
    </Modal>
  );
}

export function RefundDialog({ order, onClose, presetItems }) {
  const idempotencyKey = useMemo(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`), []);
  const [qty, setQty] = useState(() => Object.fromEntries((order.items || []).map((i) => [i._id, presetItems?.[i._id] || 0])));
  const itemValue = (order.items || []).reduce((s, i) => s + Math.round((i.netTotal / i.quantity) * (qty[i._id] || 0)), 0);
  const [amount, setAmount] = useState(toRupees(order.refundable));
  const [touchedAmount, setTouchedAmount] = useState(false);
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(false);
  const isCod = order.payment?.provider === 'cod';
  const [manualReference, setManualReference] = useState('');
  const shownAmount = touchedAmount ? amount : itemValue ? toRupees(Math.min(itemValue, order.refundable)) : amount;
  const paise = toPaise(shownAmount) || 0;
  const items = Object.entries(qty).filter(([, q]) => q > 0).map(([orderItem, quantity]) => ({ orderItem, quantity }));
  const save = useAction(() => api(`/orders/${order._id}/refunds`, { method: 'POST', body: { amount: paise, reason: reason.trim(), items: items.length ? items : undefined, restock: items.length ? restock : false, idempotencyKey, manualReference: isCod ? manualReference.trim() || undefined : undefined } }), {
    invalidate: keys(order),
    success: isCod ? 'Refund recorded' : 'Refund initiated with CCAvenue',
    onSuccess: onClose,
  });
  const valid = paise > 0 && paise <= order.refundable && reason.trim().length >= 3;
  return (
    <Modal open onClose={onClose} title="Issue a refund" size="lg" footer={<Footer onClose={onClose} busy={save.isPending} disabled={!valid} label={`Refund ${inr(paise)}`} tone="btn-primary" onClick={() => save.mutate()} />}>
      <div className="space-y-4">
        <p className="text-sm text-graphite-600">
          Up to <strong>{inr(order.refundable)}</strong> can be refunded.{' '}
          {isCod ? 'This was a cash-on-delivery order: pay the customer by bank transfer or UPI first, then record the transfer reference here.' : 'Money goes back to the original payment method; card details are never handled by us.'}
        </p>
        <div className="overflow-x-auto rounded border border-stone-300">
          <table className="tbl">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Paid each</th>
                <th className="text-right">Already refunded</th>
                <th className="text-right">Refund qty</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => {
                const max = i.quantity - (i.quantityRefunded || 0) - (i.quantityCancelled || 0);
                return (
                  <tr key={i._id}>
                    <td>
                      {i.name}
                      <span className="block text-xs text-graphite-400">{i.sku}</span>
                    </td>
                    <td className="text-right tabular">{inr(Math.round(i.netTotal / i.quantity))}</td>
                    <td className="text-right tabular">{i.quantityRefunded || 0}</td>
                    <td className="text-right">
                      <input type="number" min={0} max={max} step={1} className="input ml-auto w-20 text-right" value={qty[i._id]} disabled={max <= 0} onChange={(e) => (setQty({ ...qty, [i._id]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) }), setTouchedAmount(false))} aria-label={`Refund quantity for ${i.name}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Refund amount (₹)" inputMode="decimal" required value={shownAmount} onChange={(e) => (setAmount(e.target.value), setTouchedAmount(true))} hint={itemValue ? `Selected items are worth ${inr(itemValue)}. You can add delivery or packaging if they are refundable.` : 'Choose items above, or enter an amount (for example a goodwill or delivery refund).'} error={paise > order.refundable ? 'More than the refundable amount' : undefined} />
          <Textarea label="Reason" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} hint="Shown to the customer" />
        </div>
        {isCod ? <Input label="Bank / UPI transfer reference" value={manualReference} onChange={(e) => setManualReference(e.target.value)} hint="UTR or UPI reference of the money you sent. Included in the customer's refund email." /> : null}
        {items.length ? <Checkbox label="Put the refunded items back into stock" hint="Only if they came back unused and sellable" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> : null}
      </div>
    </Modal>
  );
}

export function ReturnDialog({ order, request, onClose }) {
  const [status, setStatus] = useState(nextReturnStatus(request.status));
  const [adminNotes, setNotes] = useState(request.adminNotes || '');
  const [paidBy, setPaidBy] = useState(request.returnShippingPaidBy || 'store');
  const [deduction, setDeduction] = useState(toRupees(request.deductionAmount || 0));
  const [restock, setRestock] = useState(true);
  const save = useAction(
    () =>
      api(`/returns/${request._id}`, {
        method: 'PATCH',
        body: { status, adminNotes: adminNotes.trim() || undefined, returnShippingPaidBy: paidBy, deductionAmount: toPaise(deduction) || 0, ...(['refund_initiated', 'refunded'].includes(status) ? { restock } : {}) },
      }),
    { invalidate: [...keys(order), '/returns'], success: 'Return updated', onSuccess: onClose }
  );
  return (
    <Modal open onClose={onClose} title={`Return ${request.requestNumber}`} footer={<Footer onClose={onClose} busy={save.isPending} label="Save" onClick={() => save.mutate()} />}>
      <div className="space-y-4">
        <div className="rounded bg-stone-200 p-3 text-sm">
          <p className="font-medium">{humanize(request.type)}: {request.reason}</p>
          {request.description ? <p className="mt-1 text-graphite-600">{request.description}</p> : null}
          <ul className="mt-2 text-xs">
            {request.items.map((i) => (
              <li key={i.orderItem}>
                {i.quantity} × {i.name} ({i.sku})
              </li>
            ))}
          </ul>
          {request.photos?.length ? (
            <div className="mt-2 flex gap-2">
              {request.photos.map((p) => (
                <a key={p.url} href={p.url} target="_blank" rel="noreferrer">
                  <img src={p.url} alt="Customer photo" className="h-16 w-16 rounded object-cover" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <Select
          label="Move to"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[['approved', 'Approved'], ['rejected', 'Rejected'], ['pickup_scheduled', 'Pickup scheduled'], ['received', 'Received at warehouse'], ['refund_initiated', 'Refund the customer now'], ['closed', 'Closed']]}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Return shipping paid by" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} options={[['store', 'Us (store)'], ['customer', 'Customer']]} />
          <Input label="Deduction (₹)" inputMode="decimal" value={deduction} onChange={(e) => setDeduction(e.target.value)} hint="Only as stated in the return policy" />
        </div>
        {status === 'refund_initiated' ? <Checkbox label="Restock the returned items" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> : null}
        <Textarea label="Notes to the customer" rows={3} value={adminNotes} onChange={(e) => setNotes(e.target.value)} hint={status === 'rejected' ? 'Explain why the return was rejected.' : undefined} />
      </div>
    </Modal>
  );
}

function nextReturnStatus(s) {
  return { requested: 'approved', approved: 'pickup_scheduled', pickup_scheduled: 'received', received: 'refund_initiated' }[s] || 'closed';
}
