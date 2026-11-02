import Image from 'next/image';

/**
 * Product image with a branded fallback. No image is ever fabricated: when a product has no photo,
 * a neutral plate shows the product's initials so the layout stays intact.
 */
export function Placeholder({ name, className = '' }) {
  const initials = String(name || 'DDG')
    .replace(/^DareDevil\s+/i, '')
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return (
    <div className={`contours-light flex h-full w-full items-center justify-center ${className}`} role="img" aria-label={`${name} — photo coming soon`}>
      <span className="font-display text-[clamp(1.2rem,4vw,2.6rem)] font-bold tracking-wider text-stone-400">{initials}</span>
    </div>
  );
}

export default function ProductThumb({ image, name, size = 64, className = '' }) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded bg-stone-200 ${className}`} style={{ width: size, height: size }}>
      {image?.url ? <Image src={image.url} alt={image.alt || name} fill sizes={`${size}px`} className="object-cover" /> : <Placeholder name={name} />}
    </div>
  );
}
