import { siteUrl } from '@/lib/api-server';

export default function robots() {
  const base = siteUrl();
  const production = process.env.NODE_ENV === 'production' && !/localhost|staging|test/.test(base);
  return {
    rules: production
      ? [{ userAgent: '*', allow: '/', disallow: ['/checkout', '/cart', '/account', '/api/', '/search'] }]
      : [{ userAgent: '*', disallow: '/' }],
    sitemap: `${base}/sitemap.xml`,
  };
}
