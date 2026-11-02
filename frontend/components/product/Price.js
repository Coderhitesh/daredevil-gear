import { inr } from '@/lib/format';

/**
 * Tax-inclusive price. A struck-through price appears ONLY for a genuine, admin-configured sale.
 * Packaging is disclosed next to the price when it is charged separately.
 */
export default function Price({ price, regularPrice, onSale, packagingCharge, packagingMode, size = 'md', showTaxNote = false, saleEndsAt }) {
  const big = size === 'lg';
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <span className={`tabular font-display font-semibold text-ink ${big ? 'text-[2.1rem] leading-none' : 'text-lg'}`}>{inr(price)}</span>
        {onSale && regularPrice > price ? (
          <>
            <s className="tabular text-graphite-400" aria-label={`Regular price ${inr(regularPrice)}`}>
              {inr(regularPrice)}
            </s>
            <span className="tag-signal">Save {inr(regularPrice - price)}</span>
          </>
        ) : null}
      </div>
      {showTaxNote ? <p className="mt-1 text-sm text-graphite">Inclusive of all taxes</p> : null}
      {showTaxNote && packagingCharge > 0 && packagingMode !== 'included' ? (
        <p className="text-sm text-graphite">+ {inr(packagingCharge)} packaging{packagingMode === 'per_unit' ? ' per unit' : ''}, shown in your cart before payment</p>
      ) : null}
      {onSale && saleEndsAt && showTaxNote ? <p className="text-sm text-graphite">Offer ends {new Date(saleEndsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</p> : null}
    </div>
  );
}
