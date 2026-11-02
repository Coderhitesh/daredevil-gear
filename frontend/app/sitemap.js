import { apiGet, siteUrl } from '@/lib/api-server';

export const revalidate = 3600;

export default async function sitemap() {
  const base = siteUrl();
  const data = await apiGet('/storefront/sitemap', { revalidate: 3600 }).catch(() => ({ products: [], categories: [], pages: [], collections: [] }));
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/shop`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/bulk-orders`, changeFrequency: 'yearly', priority: 0.4 },
    ...data.categories.map((c) => ({ url: `${base}/category/${c.slug}`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 })),
    ...data.collections.map((c) => ({ url: `${base}/collections/${c.slug}`, changeFrequency: 'weekly', priority: 0.6 })),
    ...data.products.map((p) => ({ url: `${base}/product/${p.slug}`, lastModified: new Date(p.updatedAt), changeFrequency: 'weekly', priority: 0.7 })),
    ...data.pages.filter((p) => p.slug !== 'about-us').map((p) => ({ url: `${base}/pages/${p.slug}`, lastModified: new Date(p.updatedAt), changeFrequency: 'monthly', priority: 0.3 })),
  ];
}
