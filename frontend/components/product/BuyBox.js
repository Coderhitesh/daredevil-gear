'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldAlert, Share2, Truck, RotateCcw } from 'lucide-react';
import Price from './Price';
import QuantityStepper from '../ui/QuantityStepper';
import WishlistButton from './WishlistButton';
import PincodeCheck from './PincodeCheck';
import { useAddToCart } from '@/lib/hooks';
import { useUi } from '@/lib/store';

export default function BuyBox({ product: p }) {
  const router = useRouter();
  const notify = useUi((s) => s.notify);
  const [variantId, setVariantId] = useState(p.variants.find((v) => v.inStock)?.id || p.variants[0]?.id);
  const variant = p.variants.find((v) => v.id === variantId) || p.variants[0];
  const [qty, setQty] = useState(1);
  const { add, isPending } = useAddToCart();
  const inStock = Boolean(variant?.inStock);

  const addToCart = async (buyNow = false) => {
    try {
      await add({ productId: p.id, variantId: variant.id, quantity: qty }, { openDrawer: !buyNow });
      if (buyNow) router.push('/checkout');
    } catch {
      /* toast shown by hook */
    }
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: p.name, url });
      else {
        await navigator.clipboard.writeText(url);
        notify('Link copied', 'good');
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="mt-6 space-y-6">
      <Price price={variant?.price ?? p.price} regularPrice={variant?.regularPrice ?? p.regularPrice} onSale={variant?.onSale ?? p.onSale} saleEndsAt={p.saleEndsAt} packagingCharge={p.packagingCharge} packagingMode={p.packagingMode} size="lg" showTaxNote />

      {p.siblings?.length ? (
        <div>
          <p className="mb-2 text-sm font-medium">Also available in</p>
          <ul className="flex flex-wrap gap-2">
            <li>
              <span aria-current="true" className="inline-block rounded border-2 border-signal bg-signal-50 px-3 py-1.5 text-sm font-medium">
                {p.variantLabel || 'This option'}
              </span>
            </li>
            {p.siblings.map((s) => (
              <li key={s.slug}>
                <Link href={`/product/${s.slug}`} className={`inline-block rounded border border-stone-400 bg-white px-3 py-1.5 text-sm hover:border-graphite ${s.inStock ? '' : 'text-graphite-400 line-through'}`}>
                  {s.label || s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {p.variants.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Option</legend>
          <div className="flex flex-wrap gap-2">
            {p.variants.map((v) => (
              <label key={v.id} className={`cursor-pointer rounded border px-3 py-2 text-sm ${v.id === variantId ? 'border-2 border-signal bg-signal-50 font-medium' : 'border-stone-400 bg-white'} ${v.inStock ? '' : 'text-graphite-400'}`}>
                <input type="radio" name="variant" value={v.id} className="sr-only" checked={v.id === variantId} onChange={() => (setVariantId(v.id), setQty(1))} />
                {v.title}
                {!v.inStock ? ' (out of stock)' : ''}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {p.safety.minAge >= 18 || p.safety.domesticOnly ? (
        <div className="flex gap-3 rounded-xl border border-olive/30 bg-olive-light p-4 text-sm text-ink">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-olive" />
          <p>
            {p.safety.minAge >= 18 ? 'Sold to adults aged 18 and over. ' : ''}
            {p.safety.domesticOnly ? 'Delivered within India only. ' : ''}
            {p.safety.dangerousGoods ? 'Shipped as dangerous goods (aerosol). ' : ''}
            {p.returns.returnable ? '' : 'Non-returnable unless damaged or wrong.'}
          </p>
        </div>
      ) : null}

      <div>
        <p className={`mb-3 text-sm font-medium ${inStock ? 'text-okay' : 'text-alert'}`} role="status">
          {inStock ? 'In stock' : 'Out of stock'}
        </p>
        <div className="flex items-center justify-between gap-3 sm:hidden">
          {inStock ? <QuantityStepper value={qty} max={variant.maxQuantity} onChange={setQty} /> : <span />}
          <div className="flex gap-1">
            <WishlistButton productId={p.id} name={p.name} withLabel className="btn-ghost btn-sm" />
            <button type="button" onClick={share} className="btn-ghost btn-sm">
              <Share2 size={16} /> Share
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:mt-0 sm:flex sm:flex-wrap sm:items-center">
          {inStock ? (
            <div className="hidden sm:block">
              <QuantityStepper value={qty} max={variant.maxQuantity} onChange={setQty} />
            </div>
          ) : null}
          <button type="button" className="btn-dark w-full sm:w-auto sm:px-8" disabled={!inStock || isPending} onClick={() => addToCart(false)}>
            {isPending ? 'Adding…' : 'Add to cart'}
          </button>
          <button type="button" className="btn-primary w-full sm:w-auto sm:px-8" disabled={!inStock || isPending} onClick={() => addToCart(true)}>
            Buy now
          </button>
        </div>
        <div className="mt-3 hidden gap-1 sm:flex">
          <WishlistButton productId={p.id} name={p.name} withLabel className="btn-ghost btn-sm" />
          <button type="button" onClick={share} className="btn-ghost btn-sm">
            <Share2 size={16} /> Share
          </button>
        </div>
        {!inStock ? <p className="mt-2 text-sm text-graphite">Need this urgently or in bulk? <Link href="/contact" className="link">Contact us</Link> and we will tell you when it is back.</p> : null}
      </div>

      <PincodeCheck slug={p.slug} />

      <ul className="space-y-2.5 border-t border-stone-300 pt-5 text-sm text-graphite">
        <li className="flex gap-2.5">
          <Truck size={17} className="mt-0.5 shrink-0" />
          <span>
            Delivery charge shown at checkout before payment. <Link href="/pages/shipping-policy" className="link">Shipping policy</Link>
          </span>
        </li>
        <li className="flex gap-2.5">
          <RotateCcw size={17} className="mt-0.5 shrink-0" />
          <span>
            {p.returns.returnable ? `${p.returns.windowDays}-day returns on unused items. ` : 'Non-returnable unless it arrives damaged or wrong. '}
            <Link href="/pages/return-refund-policy" className="link">Return policy</Link>
          </span>
        </li>
      </ul>
    </div>
  );
}
