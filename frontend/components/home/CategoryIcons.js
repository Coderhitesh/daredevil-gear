import Link from 'next/link';
import { categoryIcon } from '@/lib/category-icons';

/** Round icon shortcuts to every department, under the hero. */
export default function CategoryIcons({ categories = [] }) {
  if (!categories.length) return null;
  return (
    <section aria-label="Shop by category" className="bg-white">
      <ul className="wrap no-scrollbar flex gap-4 overflow-x-auto py-8 sm:gap-5 xl:justify-between xl:gap-2">
        {categories.map((c, k) => {
          const { Icon, tint, ink } = categoryIcon(c.slug);
          return (
            <li key={c.id} className="reveal-pop shrink-0" style={{ '--i': k }}>
              <Link href={`/category/${c.slug}`} className="group flex w-[88px] flex-col items-center gap-2.5 text-center">
                <span className="flex h-[76px] w-[76px] items-center justify-center rounded-full ring-1 ring-black/[0.04] transition-transform duration-200 group-hover:-translate-y-1 group-hover:shadow-card" style={{ background: tint, color: ink }}>
                  <Icon size={30} strokeWidth={1.6} aria-hidden="true" className="hop-on-hover" />
                </span>
                <span className="text-[12.5px] font-medium leading-snug text-ink group-hover:text-signal-dark">{c.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
