'use client';

const reduced = () => typeof window === 'undefined' || !document.documentElement.classList.contains('motion-ok');

/** Wiggle the header cart button (restarts the animation if it is already running). */
export function bumpCart() {
  const target = document.querySelector('[data-cart-target]');
  if (!target || reduced()) return;
  target.classList.remove('cart-bump');
  void target.offsetWidth; // reflow so the animation can replay
  target.classList.add('cart-bump');
}

/**
 * A small round copy of the product photo arcs from `fromEl` to the header cart, then the cart bumps.
 * Purely visual; resolves when the flight ends (or immediately for reduced motion).
 */
export function flyToCart(fromEl, imageSrc) {
  const target = document.querySelector('[data-cart-target]');
  if (!fromEl || !target || reduced() || !Element.prototype.animate) {
    bumpCart();
    return Promise.resolve();
  }
  const a = fromEl.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const size = 56;
  const dot = document.createElement('div');
  dot.setAttribute('aria-hidden', 'true');
  Object.assign(dot.style, {
    position: 'fixed',
    left: `${a.left + a.width / 2 - size / 2}px`,
    top: `${a.top + a.height / 2 - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '999px',
    zIndex: '90',
    pointerEvents: 'none',
    background: imageSrc ? `#fff url("${imageSrc}") center/80% no-repeat` : '#EE5A1F',
    boxShadow: '0 10px 24px -8px rgba(238,90,31,.7), 0 0 0 3px #EE5A1F',
  });
  document.body.appendChild(dot);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const lift = Math.min(160, Math.abs(dy) * 0.45 + 60); // arc height
  const anim = dot.animate(
    [
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(.8)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(.25)`, opacity: 0.6 },
    ],
    { duration: 750, easing: 'cubic-bezier(.45,0,.2,1)' }
  );
  return anim.finished
    .catch(() => {})
    .then(() => {
      dot.remove();
      bumpCart();
    });
}
