import Image from 'next/image';
import Link from 'next/link';
import logo from '@/public/brand/logo_theme2.png';

/** The supplied logo, used unaltered. On dark surfaces it sits on its own white plate. */
export default function Logo({ className = '', priority = false, plate = true }) {
  return (
    <Link href="/" className={`inline-flex shrink-0 items-center ${plate ? 'rounded-lg bg-white px-2.5 py-1.5' : ''} ${className}`} aria-label="DareDevil Gears — home">
      <Image src={logo} alt="DareDevil Gears — Make in India" priority={priority} className="h-8 w-auto sm:h-9" sizes="200px" />
    </Link>
  );
}
