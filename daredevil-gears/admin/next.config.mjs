import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const API = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';

// The admin is never indexed, never framed, and never cached by shared caches.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Docker images use the self-contained server (NEXT_OUTPUT=standalone); PM2 uses `next start`.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: root,
  images: { remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }] },
  // dev: proxy the API so the admin session cookie stays first-party. Production: Nginx routes /api.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  experimental: { optimizePackageImports: ['lucide-react'] },
};

export default nextConfig;
