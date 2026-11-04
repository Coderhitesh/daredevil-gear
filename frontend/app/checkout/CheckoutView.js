'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, ShieldAlert, Check, Banknote, CreditCard } from 'lucide-react';
import { api, fieldErrors } from '@/lib/api-client';
import { useMe } from '@/lib/hooks';
import { pay } from '@/lib/razorpay';
import { addressSchema, email as emailSchema, phone, clean } from '@/lib/validation';
import AddressFields from '@/components/forms/AddressFields';
import Field from '@/components/forms/Field';
import OrderSummary from '@/components/cart/OrderSummary';
import CouponForm from '@/components/cart/CouponForm';
import ProductThumb from '@/components/product/ProductThumb';
import { inr, deliveryEta } from '@/lib/format';

// hidden address inputs keep '' after being unmounted; treat blank as missing so they do not fail validation
const blanksToUndefined = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, v === '' ? undefined : v]));

const schema = z
  .object({
    mode: z.enum(['saved', 'new']),
    addressId: z.string().optional(),
    contact: z.object({ name: z.string().trim().min(2, 'Enter your name').optional().or(z.literal('')), email: emailSchema.optional().or(z.literal('')), phone: phone.optional().or(z.literal('')) }),
    shipping: z.preprocess(blanksToUndefined, addressSchema.partial()),
    billingSame: z.boolean(),
    billing: z.preprocess(blanksToUndefined, addressSchema.partial()),
    saveAddress: z.boolean(),
    ageConfirmed: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const check = (prefix, obj) => {
      const r = addressSchema.safeParse(Object.fromEntries(Object.keys(addressSchema.shape).map((k) => [k, obj?.[k] ?? ''])));
      if (!r.success) r.error.issues.forEach((i) => ctx.addIssue({ ...i, path: [prefix, ...i.path] }));
    };
    if (v.mode === 'new') check('shipping', v.shipping);
    if (v.mode === 'saved' && !v.addressId) ctx.addIssue({ code: 'custom', path: ['addressId'], message: 'Choose an address' });
    if (!v.billingSame) check('billing', v.billing);
  });

function PayOption({ checked, disabled, onChange, icon: Icon, title, note, right }) {
  return (
    <label className={`flex items-center justify-between gap-3 rounded border p-4 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${checked ? 'border-2 border-graphite' : 'border-stone-300'}`}>
      <span className="flex items-center gap-3">
        <input type="radio" name="paymethod" className="accent-signal" checked={checked} disabled={disabled} onChange={onChange} />
        <Icon size={20} strokeWidth={1.6} className="shrink-0 text-graphite" aria-hidden="true" />
        <span>
          <span className="font-medium">{title}</span>
          {note ? <span className="block text-sm text-graphite">{note}</span> : null}
        </span>
      </span>
      {right ? <span className="tabular font-medium">{right}</span> : null}
    </label>
  );
}

function Step({ n, title, done, children }) {
  return (
    <section className="panel p-5 sm:p-6" aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="mb-5 flex items-center gap-3 font-display text-2xl">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-base ${done ? 'bg-okay text-white' : 'bg-graphite text-white'}`} aria-hidden="true">
          {done ? <Check size={16} /> : n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** crypto.randomUUID only exists on https/localhost; opening the site by LAN IP would otherwise crash checkout. */
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  const a = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** { shipping: { pincode: {message} } } -> { 'shipping.pincode': message } */
function flatErrors(errs, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(errs || {})) {
    if (!v || typeof v !== 'object') continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v.message === 'string') out[key] = v.message;
    else flatErrors(v, key, out);
  }
  return out;
}

export default function CheckoutView() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();
  const { data: config } = useQuery({ queryKey: ['checkout-config'], queryFn: () => api('/checkout/config') });
  const { data: addresses = [] } = useQuery({ queryKey: ['addresses'], enabled: Boolean(me), queryFn: () => api('/addresses') });
  const [rateId, setRateId] = useState(null);
  const [payMethod, setPayMethod] = useState('online'); // online | cod
  const [codBlocked, setCodBlocked] = useState(null); // reason COD was refused for this address
  const [payState, setPayState] = useState({ status: 'idle' });
  const pending = useRef(null); // { orderNumber, razorpay, guestAccessToken }

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { mode: 'new', contact: { name: '', email: '', phone: '' }, shipping: { country: 'IN' }, billingSame: true, billing: { country: 'IN' }, saveAddress: true, ageConfirmed: false },
  });
  const { register, watch, setValue, handleSubmit, formState, setError } = form;
  const mode = watch('mode');
  const addressId = watch('addressId');
  const shipPin = watch('shipping.pincode');
  const shipState = watch('shipping.state');
  const billingSame = watch('billingSame');

  useEffect(() => {
    if (addresses.length && !form.getValues('addressId')) {
      setValue('mode', 'saved');
      setValue('addressId', (addresses.find((a) => a.isDefaultShipping) || addresses[0])._id);
    }
  }, [addresses, setValue, form]);

  const destination = useMemo(() => {
    if (mode === 'saved' && addressId) return { addressId };
    if (mode === 'new' && /^[1-9]\d{5}$/.test(shipPin || '') && shipState) return { pincode: shipPin, state: shipState };
    return null;
  }, [mode, addressId, shipPin, shipState]);

  const quote = useQuery({
    queryKey: ['quote', destination, rateId, payMethod],
    queryFn: () => api('/checkout/quote', { method: 'POST', body: { ...(destination || {}), rateId: rateId || undefined, paymentMethod: payMethod } }),
    placeholderData: (prev) => prev,
  });
  const cart = quote.data;

  useEffect(() => {
    if (cart?.shipping?.selected && cart.shipping.selected.rateId !== rateId) setRateId(cart.shipping.selected.rateId);
  }, [cart, rateId]);

  // COD refused for this PIN code / order value: switch back to online and say why
  useEffect(() => {
    if (payMethod === 'cod' && cart?.cod && !quote.isPlaceholderData && cart.cod.available === false) {
      setCodBlocked(cart.cod.reason || 'Cash on delivery is not available for this order.');
      setPayMethod('online');
    }
  }, [payMethod, cart, quote.isPlaceholderData]);
  useEffect(() => setCodBlocked(null), [destination]);

  // only cash on delivery is switched on: select it
  useEffect(() => {
    if (config && config.onlinePaymentsEnabled === false && config.codEnabled && payMethod === 'online' && !codBlocked) setPayMethod('cod');
  }, [config, payMethod, codBlocked]);

  if (meLoading || quote.isLoading) {
    return (
      <div className="wrap grid gap-8 pt-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          <div className="skeleton h-40" />
          <div className="skeleton h-72" />
        </div>
        <div className="skeleton h-96" />
      </div>
    );
  }

  if (!cart?.items?.length) {
    return (
      <div className="wrap pt-16 text-center">
        <h1 className="font-display text-display-md">Your cart is empty</h1>
        <Link href="/shop" className="btn-dark mt-6">
          Shop the range
        </Link>
      </div>
    );
  }

  if (me && !me.emailVerified) {
    return (
      <div className="wrap max-w-lg pt-16">
        <h1 className="font-display text-display-md">Verify your email to continue</h1>
        <p className="mt-3 text-graphite">We sent a 6-digit code to {me.email}.</p>
        <Link href={`/account/verify?email=${encodeURIComponent(me.email)}&next=/checkout`} className="btn-primary mt-6">
          Enter code
        </Link>
      </div>
    );
  }

  const guest = !me;
  const guestAllowed = config?.guestCheckout !== false;
  const deliveryReady = Boolean(cart.shipping?.selected);
  const total = cart.totals.grandTotal;
  const isCod = payMethod === 'cod' && Boolean(cart.cod?.selected);

  const onSubmit = async (v) => {
    if (cart.requiresAgeConfirmation && !v.ageConfirmed) {
      setError('ageConfirmed', { message: 'Please confirm you are 18 or older' });
      return;
    }
    if (guest && (!v.contact.email || !v.contact.name)) {
      if (!v.contact.email) setError('contact.email', { message: 'Enter your email for order updates' });
      if (!v.contact.name) setError('contact.name', { message: 'Enter your name' });
      return;
    }
    setPayState({ status: 'placing' });
    try {
      let placed = pending.current;
      if (!placed) {
        placed = await api('/checkout/place', {
          method: 'POST',
          body: {
            idempotencyKey: uid(),
            contact: clean({ name: v.contact.name || undefined, email: guest ? v.contact.email : undefined, phone: v.contact.phone || undefined }),
            addressId: v.mode === 'saved' ? v.addressId : undefined,
            shippingAddress: v.mode === 'new' ? clean(v.shipping) : undefined,
            billingSameAsShipping: v.billingSame,
            billingAddress: v.billingSame ? undefined : clean(v.billing),
            rateId: cart.shipping?.selected?.rateId,
            paymentMethod: isCod ? 'cod' : 'online',
            ageConfirmed: cart.requiresAgeConfirmation ? true : undefined,
            saveAddress: Boolean(me && v.mode === 'new' && v.saveAddress),
            expectedTotal: total,
          },
        });
        if (placed.guestAccessToken) sessionStorage.setItem(`ddg-order-${placed.orderNumber}`, placed.guestAccessToken);
        if (placed.paymentMethod === 'cod') {
          // no payment step: the order is confirmed
          qc.invalidateQueries({ queryKey: ['cart'] });
          router.push(`/checkout/success?order=${placed.orderNumber}&cod=1`);
          return;
        }
        pending.current = placed;
      } else {
        placed = { ...placed, ...(await api(`/checkout/orders/${placed.orderNumber}/pay`, { method: 'POST', headers: placed.guestAccessToken ? { 'x-ddg-order-token': placed.guestAccessToken } : {} })) };
      }
      setPayState({ status: 'paying', orderNumber: placed.orderNumber });
      const response = await pay(placed.razorpay);
      setPayState({ status: 'verifying', orderNumber: placed.orderNumber });
      await api('/payments/razorpay/verify', { method: 'POST', body: response });
      pending.current = null;
      qc.invalidateQueries({ queryKey: ['cart'] });
      router.push(`/checkout/success?order=${placed.orderNumber}`);
    } catch (err) {
      if (err?.dismissed) {
        setPayState({ status: 'dismissed', message: 'Payment window closed. Your items are held for 30 minutes — you can try again.' });
      } else if (err?.failed) {
        if (pending.current) api('/payments/razorpay/failure', { method: 'POST', body: { razorpay_order_id: pending.current.razorpay.orderId, code: err.error?.code, description: err.error?.description, reason: err.error?.reason } }).catch(() => {});
        setPayState({ status: 'failed', message: `${err.error?.description || 'The payment did not go through.'} No money has been taken. You can try again or use a different method.` });
      } else {
        if (['COD_NOT_AVAILABLE', 'COD_NOT_SERVICEABLE', 'COD_LIMIT'].includes(err.code)) {
          setCodBlocked(err.message);
          setPayMethod('online');
        }
        if (['CART_CHANGED', 'TOTAL_CHANGED', 'OUT_OF_STOCK', 'PAYMENT_EXPIRED', 'NOT_PENDING'].includes(err.code)) {
          pending.current = null;
          qc.invalidateQueries({ queryKey: ['quote'] });
          qc.invalidateQueries({ queryKey: ['cart'] });
        }
        const fe = fieldErrors(err);
        Object.entries(fe).forEach(([k, msg]) => {
          const key = k.replace(/^shippingAddress/, 'shipping').replace(/^billingAddress/, 'billing');
          try {
            setError(key, { message: msg });
          } catch {
            /* unknown field */
          }
        });
        setPayState({ status: 'error', message: err.message });
      }
    }
  };

  // never fail silently: tell the customer what is missing and jump to the first problem field
  const onInvalid = (errors) => {
    setPayState({ status: 'error', message: 'Please complete the highlighted fields above.' });
    const first = Object.keys(flatErrors(errors))[0];
    if (first) {
      const el = document.querySelector(`#checkout-form [name="${first}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus({ preventScroll: true });
      }
    }
  };

  const busy = ['placing', 'paying', 'verifying'].includes(payState.status);
  const onlineOff = config && config.onlinePaymentsEnabled === false;
  const codOn = Boolean(config?.codEnabled) && (!guest || config?.codGuestAllowed !== false);
  const paymentsOff = isCod ? false : onlineOff;

  return (
    <div className="wrap pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-display-lg">Checkout</h1>
        <p className="flex items-center gap-2 text-sm text-graphite">
          <Lock size={15} /> Secure payment by Razorpay
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
        <form id="checkout-form" onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate className="space-y-6">
          <Step n={1} title="Contact" done={Boolean(me)}>
            {me ? (
              <p className="text-graphite">
                Signed in as <strong className="text-ink">{me.email}</strong>. Order updates will be sent here.
              </p>
            ) : guestAllowed ? (
              <div className="space-y-4">
                <p className="text-sm text-graphite">
                  Have an account? <Link href="/account/login?next=/checkout" className="link">Sign in</Link> for saved addresses and order history. Or continue as a guest:
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Email" required type="email" autoComplete="email" {...register('contact.email')} error={formState.errors.contact?.email?.message} hint="For your order confirmation and tracking" />
                  <Field
                    label="Full name"
                    required
                    autoComplete="name"
                    {...register('contact.name', {
                      onBlur: (ev) => {
                        // Saves retyping: copy into the delivery name only when that is still empty.
                        if (ev.target.value && !form.getValues('shipping.fullName')) setValue('shipping.fullName', ev.target.value);
                      },
                    })}
                    error={formState.errors.contact?.name?.message}
                  />
                </div>
              </div>
            ) : (
              <div>
                <p className="text-graphite">Please sign in or create an account to place your order.</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="/account/login?next=/checkout" className="btn-dark">Sign in</Link>
                  <Link href="/account/register?next=/checkout" className="btn-outline">Create account</Link>
                </div>
              </div>
            )}
          </Step>

          <Step n={2} title="Delivery address" done={Boolean(destination)}>
            {addresses.length ? (
              <fieldset className="mb-5 space-y-2">
                <legend className="sr-only">Saved addresses</legend>
                {addresses.map((a) => (
                  <label key={a._id} className={`flex cursor-pointer gap-3 rounded border p-4 ${mode === 'saved' && addressId === a._id ? 'border-2 border-graphite' : 'border-stone-300'}`}>
                    <input type="radio" className="mt-1 accent-signal" checked={mode === 'saved' && addressId === a._id} onChange={() => (setValue('mode', 'saved'), setValue('addressId', a._id))} />
                    <span className="text-[15px]">
                      <strong>{a.fullName}</strong> {a.label ? <span className="tag-muted ml-1">{a.label}</span> : null}
                      <span className="block text-graphite">
                        {a.line1}
                        {a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.pincode}
                      </span>
                      <span className="block text-graphite">{a.phone}</span>
                    </span>
                  </label>
                ))}
                <label className={`flex cursor-pointer gap-3 rounded border p-4 ${mode === 'new' ? 'border-2 border-graphite' : 'border-stone-300'}`}>
                  <input type="radio" className="accent-signal" checked={mode === 'new'} onChange={() => setValue('mode', 'new')} />
                  <span className="text-[15px] font-medium">Use a new address</span>
                </label>
                {formState.errors.addressId ? <p className="field-error">{formState.errors.addressId.message}</p> : null}
              </fieldset>
            ) : null}
            {mode === 'new' ? (
              <>
                <AddressFields register={register} errors={formState.errors} prefix="shipping" />
                {me ? (
                  <label className="mt-4 flex items-center gap-2 text-sm">
                    <input type="checkbox" className="accent-signal" {...register('saveAddress')} /> Save this address to my account
                  </label>
                ) : null}
              </>
            ) : null}
            <label className="mt-5 flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-signal" {...register('billingSame')} /> Billing address is the same as delivery
            </label>
            {!billingSame ? (
              <div className="mt-5 border-t border-stone-300 pt-5">
                <h3 className="mb-4 font-display text-xl">Billing address</h3>
                <AddressFields register={register} errors={formState.errors} prefix="billing" showBusiness />
              </div>
            ) : null}
          </Step>

          <Step n={3} title="Delivery option" done={deliveryReady}>
            {!destination ? (
              <p className="text-graphite">Enter your PIN code and state above to see delivery options and charges.</p>
            ) : cart.shippingError ? (
              <p className="text-alert" role="alert">
                {cart.shippingError.message}
              </p>
            ) : (
              <fieldset className="space-y-2">
                <legend className="sr-only">Delivery options</legend>
                {cart.shipping?.options?.map((o) => (
                  <label key={o.rateId} className={`flex cursor-pointer items-center justify-between gap-3 rounded border p-4 ${rateId === o.rateId ? 'border-2 border-graphite' : 'border-stone-300'}`}>
                    <span className="flex items-center gap-3">
                      <input type="radio" name="rate" className="accent-signal" checked={rateId === o.rateId} onChange={() => setRateId(o.rateId)} />
                      <span>
                        <span className="font-medium">{o.name}</span>
                        {deliveryEta(o) ? <span className="block text-sm text-graphite">{deliveryEta(o)}</span> : null}
                        {o.amountToFree ? <span className="block text-sm text-graphite">Free if you add {inr(o.amountToFree)} more</span> : null}
                      </span>
                    </span>
                    <span className="tabular font-medium">{o.charge ? inr(o.charge) : 'Free'}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </Step>

          {codOn || onlineOff ? (
            <Step n={4} title="Payment" done={deliveryReady && (isCod || !onlineOff)}>
              <fieldset className="space-y-2">
                <legend className="sr-only">Payment method</legend>
                <PayOption
                  checked={payMethod === 'online'}
                  disabled={onlineOff}
                  onChange={() => setPayMethod('online')}
                  icon={CreditCard}
                  title="Pay online"
                  note={onlineOff ? 'Not available right now' : 'UPI, cards, net banking and wallets through Razorpay'}
                />
                {codOn ? (
                  <PayOption
                    checked={payMethod === 'cod'}
                    disabled={Boolean(codBlocked)}
                    onChange={() => {
                      setCodBlocked(null);
                      setPayMethod('cod');
                    }}
                    icon={Banknote}
                    title="Cash on delivery"
                    note={codBlocked || (isCod ? `Pay ${inr(total)} in cash or UPI to the courier when the parcel arrives.` : config?.codFee ? `Pay the courier when the parcel arrives. A cash-on-delivery fee from ${inr(config.codFee)} applies.` : 'Pay the courier in cash or UPI when the parcel arrives.')}
                    right={isCod && cart.cod.fee ? `+ ${inr(cart.cod.fee)}` : null}
                  />
                ) : null}
              </fieldset>
            </Step>
          ) : null}

          {cart.requiresAgeConfirmation ? (
            <div className="flex gap-3 rounded border border-olive/30 bg-olive-light p-5">
              <ShieldAlert size={20} className="mt-0.5 shrink-0 text-olive" />
              <div>
                <p className="font-medium">Your cart contains age-restricted items</p>
                <label className="mt-2 flex items-start gap-2 text-[15px]">
                  <input type="checkbox" className="mt-1 accent-signal" {...register('ageConfirmed')} />
                  {config?.ageConfirmationText || 'I confirm I am 18 years or older.'}
                </label>
                {formState.errors.ageConfirmed ? <p className="field-error">{formState.errors.ageConfirmed.message}</p> : null}
              </div>
            </div>
          ) : null}
        </form>

        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className="panel space-y-5 p-5">
            <h2 className="font-display text-2xl">Your order</h2>
            <ul className="max-h-72 space-y-3 overflow-y-auto">
              {cart.items.map((it) => (
                <li key={it.id} className="flex gap-3">
                  <div className="relative">
                    <ProductThumb image={it.product.image} name={it.product.name} size={56} />
                    <span className="tabular absolute -right-1.5 -top-1.5 rounded-full bg-graphite px-1.5 text-[11px] text-white">{it.quantity}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm">{it.product.name}</p>
                    <p className="text-[12px] text-graphite-400">GST {it.gstRate}% included</p>
                  </div>
                  <p className="tabular text-sm">{inr(it.lineTotal)}</p>
                </li>
              ))}
            </ul>
            <CouponForm coupon={cart.coupon} />
            {cart.notices?.length ? (
              <ul className="space-y-1 text-sm text-signal-dark" role="alert">
                {cart.notices.map((n, i) => (
                  <li key={i}>{n.message}</li>
                ))}
              </ul>
            ) : null}
            <OrderSummary totals={cart.totals} shippingLabel={cart.shipping?.selected?.name} payOnDelivery={isCod} />
            {paymentsOff ? (
              <p className="rounded-lg bg-stone-200 p-3 text-sm text-ink" role="status">
                {codOn ? 'Online payment is not switched on yet. Choose cash on delivery above, or ' : 'Online payment is not switched on yet, so orders cannot be placed right now. Please check back soon or '}
              <Link href="/contact" className="underline">contact us</Link>.
              </p>
            ) : null}
            {!deliveryReady && !busy ? <p className="text-[13px] text-graphite-400">Enter your delivery PIN code and address to see delivery charges and pay.</p> : null}
            {payState.message ? (
              <p className={`rounded p-3 text-sm ${payState.status === 'dismissed' ? 'bg-stone-200 text-ink' : 'bg-signal-light text-ink'}`} role="alert">
                {payState.message}
              </p>
            ) : null}
            <button type="submit" form="checkout-form" className="btn-primary w-full py-4 text-lg" disabled={busy || paymentsOff || !deliveryReady || !cart.canCheckout || (guest && !guestAllowed)}>
              <Lock size={17} />
              {payState.status === 'placing' ? (isCod ? 'Placing your order…' : 'Checking your order…') : payState.status === 'paying' ? 'Waiting for payment…' : payState.status === 'verifying' ? 'Confirming payment…' : !deliveryReady ? 'Add delivery address' : isCod ? `Place COD order · ${inr(total)}` : `Pay ${inr(total)}`}
            </button>
            <p className="text-[13px] leading-relaxed text-graphite-400">
              By placing this order you agree to our <Link href="/pages/terms-and-conditions" className="underline">terms</Link> and <Link href="/pages/return-refund-policy" className="underline">return policy</Link>. The amount above is the final amount you pay, including GST, packaging{isCod ? ', delivery and the cash-on-delivery fee' : ' and delivery'}.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
