import { inr } from '@/lib/format';

/** Server-calculated totals, itemised so nothing is added after the shopper sees it. */
export default function OrderSummary({ totals, shippingLabel, children, showTax = true, payOnDelivery = false }) {
  const row = 'flex justify-between gap-4 py-1.5';
  return (
    <div>
      <dl className="text-[15px]">
        <div className={row}>
          <dt className="text-graphite">Items (incl. GST)</dt>
          <dd className="tabular">{inr(totals.itemsTotal)}</dd>
        </div>
        {totals.discount ? (
          <div className={`${row} text-okay`}>
            <dt>Coupon {totals.couponCode}</dt>
            <dd className="tabular">−{inr(totals.discount)}</dd>
          </div>
        ) : null}
        {totals.packagingCharge ? (
          <div className={row}>
            <dt className="text-graphite">Packaging</dt>
            <dd className="tabular">{inr(totals.packagingCharge)}</dd>
          </div>
        ) : null}
        <div className={row}>
          <dt className="text-graphite">Delivery{shippingLabel ? ` (${shippingLabel})` : ''}</dt>
          <dd className="tabular">{totals.shippingKnown === false ? <span className="text-graphite-400">Enter PIN code</span> : totals.shippingCharge ? inr(totals.shippingCharge) : 'Free'}</dd>
        </div>
        {totals.codCharge ? (
          <div className={row}>
            <dt className="text-graphite">Cash on delivery fee</dt>
            <dd className="tabular">{inr(totals.codCharge)}</dd>
          </div>
        ) : null}
        <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-stone-300 pt-3">
          <dt className="font-medium">{totals.shippingKnown === false ? 'Total before delivery' : payOnDelivery ? 'Pay on delivery' : 'Total to pay'}</dt>
          <dd className="tabular font-display text-2xl font-semibold">{inr(totals.grandTotal)}</dd>
        </div>
        {showTax ? (
          <div className="pt-1 text-[13px] text-graphite-400">
            <dt className="inline">Includes GST of </dt>
            <dd className="tabular inline">
              {inr(totals.taxTotal)}
              {totals.taxBreakup?.length > 1 ? ` (${totals.taxBreakup.map((b) => `${b.rate}%: ${inr(b.tax)}`).join(', ')})` : ''}
            </dd>
          </div>
        ) : null}
      </dl>
      {children}
    </div>
  );
}
