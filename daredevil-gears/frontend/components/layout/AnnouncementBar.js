import Link from 'next/link';

export default function AnnouncementBar({ text, href }) {
  const inner = <span className="truncate">{text}</span>;
  return (
    <div className="bg-[#0b0e0c] text-[12.5px] text-stone-300">
      <div className="wrap flex h-8 items-center justify-center text-center">
        {href ? (
          <Link href={href} className="truncate hover:text-white hover:underline">
            {inner}
          </Link>
        ) : (
          inner
        )}
      </div>
    </div>
  );
}
