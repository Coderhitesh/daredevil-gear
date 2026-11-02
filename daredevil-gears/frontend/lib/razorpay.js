'use client';

let loader = null;

/** Load Razorpay Checkout only when the shopper is about to pay. */
export function loadRazorpay() {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.async = true;
      s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Razorpay failed to load')));
      s.onerror = () => {
        loader = null;
        reject(new Error('Could not load the payment window. Check your connection and try again.'));
      };
      document.body.appendChild(s);
    });
  }
  return loader;
}

/**
 * Open Razorpay Checkout. Resolves with the handler response (to be verified on the server),
 * rejects with { dismissed: true } or { failed: true, error }.
 */
export async function pay(params) {
  const Razorpay = await loadRazorpay();
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: params.keyId,
      order_id: params.orderId,
      amount: params.amount,
      currency: params.currency,
      name: params.name,
      description: params.description,
      prefill: params.prefill,
      notes: params.notes,
      theme: { color: '#EE5A1F' },
      retry: { enabled: true, max_count: 3 },
      handler: (response) => resolve(response),
      modal: { ondismiss: () => reject({ dismissed: true }), confirm_close: true },
    });
    rzp.on('payment.failed', (resp) => reject({ failed: true, error: resp.error }));
    rzp.open();
  });
}
