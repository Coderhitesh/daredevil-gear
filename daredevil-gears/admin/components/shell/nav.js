import {
  LayoutDashboard, BarChart3, Package, FileUp, Boxes, FolderTree, Layers, Tag, ShoppingBag, CreditCard, Undo2, PackageX, TicketPercent,
  Users, MessageSquareText, Scale, Mail, Newspaper, Home, Image as ImageIcon, FileText, Menu, Signpost, Settings, Receipt, Truck,
  MailCheck, ShieldCheck, ScrollText, Activity,
} from 'lucide-react';

/** Sidebar structure. Each item is only shown when the admin's role has `perm`. */
export const NAV = [
  {
    group: 'Overview',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard:read' },
      { href: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports:read' },
    ],
  },
  {
    group: 'Catalogue',
    items: [
      { href: '/products', label: 'Products', icon: Package, perm: 'products:read' },
      { href: '/products/import', label: 'Import from Excel', icon: FileUp, perm: 'products:import' },
      { href: '/inventory', label: 'Inventory', icon: Boxes, perm: 'products:read' },
      { href: '/categories', label: 'Categories', icon: FolderTree, perm: 'products:read' },
      { href: '/collections', label: 'Collections', icon: Layers, perm: 'products:read' },
      { href: '/brands', label: 'Brands', icon: Tag, perm: 'products:read' },
    ],
  },
  {
    group: 'Sales',
    items: [
      { href: '/orders', label: 'Orders', icon: ShoppingBag, perm: 'orders:read' },
      { href: '/payments', label: 'Payments', icon: CreditCard, perm: 'orders:read' },
      { href: '/refunds', label: 'Refunds', icon: Undo2, perm: 'orders:read' },
      { href: '/returns', label: 'Returns', icon: PackageX, perm: 'orders:read' },
      { href: '/coupons', label: 'Coupons', icon: TicketPercent, perm: 'orders:read' },
    ],
  },
  {
    group: 'Customers',
    items: [
      { href: '/customers', label: 'Customers', icon: Users, perm: 'customers:read' },
      { href: '/reviews', label: 'Reviews', icon: MessageSquareText, perm: 'reviews:moderate' },
      { href: '/grievances', label: 'Grievances', icon: Scale, perm: 'grievances:read' },
      { href: '/messages', label: 'Messages & bulk enquiries', icon: Mail, perm: 'grievances:read' },
      { href: '/newsletter', label: 'Newsletter', icon: Newspaper, perm: 'content:write' },
    ],
  },
  {
    group: 'Content',
    items: [
      { href: '/content/home', label: 'Homepage', icon: Home, perm: 'content:write' },
      { href: '/content/banners', label: 'Banners', icon: ImageIcon, perm: 'content:write' },
      { href: '/content/pages', label: 'Pages & policies', icon: FileText, perm: 'content:write' },
      { href: '/content/navigation', label: 'Menus', icon: Menu, perm: 'content:write' },
      { href: '/content/redirects', label: 'Redirects', icon: Signpost, perm: 'content:write' },
    ],
  },
  {
    group: 'Settings',
    items: [
      { href: '/settings', label: 'Store settings', icon: Settings, perm: 'settings:read' },
      { href: '/settings/tax', label: 'GST & tax', icon: Receipt, perm: 'settings:read' },
      { href: '/settings/shipping', label: 'Shipping', icon: Truck, perm: 'settings:read' },
      { href: '/settings/emails', label: 'Email templates', icon: MailCheck, perm: 'settings:read' },
      { href: '/settings/admins', label: 'Admin users', icon: ShieldCheck, perm: 'admins:manage' },
      { href: '/logs/audit', label: 'Audit log', icon: ScrollText, perm: 'audit:read' },
      { href: '/logs/email', label: 'Email log', icon: MailCheck, perm: 'orders:read' },
      { href: '/system', label: 'Launch checklist', icon: Activity, perm: 'settings:read' },
    ],
  },
];

export function isActive(pathname, href) {
  if (href === '/') return pathname === '/';
  if (href === '/products') return pathname === '/products' || (/^\/products\/[a-f\d]{24}|^\/products\/new/.test(pathname));
  if (href === '/settings') return pathname === '/settings';
  return pathname === href || pathname.startsWith(`${href}/`);
}
