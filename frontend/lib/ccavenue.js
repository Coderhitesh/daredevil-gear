'use client';

let guarded = false;

/**
 * Send the shopper to CCAvenue's hosted payment page (form POST). The page unloads, so this never resolves;
 * CCAvenue returns the shopper to /api/v1/payments/ccavenue/response, which confirms the order and redirects back.
 */
export function pay({ url, accessCode, encRequest }) {
  if (!guarded) {
    guarded = true;
    // browser Back from the gateway restores this page from cache with stale "paying" state
    window.addEventListener('pageshow', (e) => e.persisted && window.location.reload());
  }
  return new Promise(() => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    for (const [name, value] of [['encRequest', encRequest], ['access_code', accessCode]]) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  });
}
