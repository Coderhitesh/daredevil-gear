import Logo from './Logo';
import HeaderActions from './HeaderActions';
import SearchBox from '../search/SearchBox';
import MobileMenu from './MobileMenu';
import CategoryMenu from './CategoryMenu';
import MainNav from './MainNav';

/**
 * Two-tier dark header: logo + search + actions, then "All categories" menu and the main links.
 * The supplied logo has a white background, so it sits on a white plate rather than being recoloured.
 */
export default function Header({ categories = [], pages = [] }) {
  const nav = categories.filter((c) => c.showInNav);
  const hasAbout = pages.some((p) => p.slug === 'about-us');
  const links = [
    { href: '/', label: 'Home' },
    { href: '/shop', label: 'Shop' },
    ...(hasAbout ? [{ href: '/pages/about-us', label: 'About Us' }] : []),
    { href: '/bulk-orders', label: 'Bulk Orders' },
    { href: '/contact', label: 'Contact' },
  ];
  return (
    <header className="sticky top-0 z-40 bg-night text-white shadow-[0_1px_0_rgba(255,255,255,.06)]">
      <div className="wrap flex h-[68px] items-center gap-3 lg:gap-8">
        <MobileMenu categories={nav} links={links} />
        <Logo priority />
        <div className="hidden flex-1 justify-center md:flex">
          <SearchBox variant="dark" />
        </div>
        <HeaderActions />
      </div>
      <div className="wrap pb-3 md:hidden">
        <SearchBox compact variant="dark" />
      </div>
      <div className="hidden border-t border-white/[0.07] lg:block">
        <div className="wrap flex h-12 items-center gap-8">
          <CategoryMenu categories={nav} />
          <MainNav links={links} />
        </div>
      </div>
    </header>
  );
}
