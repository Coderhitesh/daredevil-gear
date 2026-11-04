import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/800.css';
import '@fontsource/kaushan-script/400.css';
import './globals.css';
import Script from 'next/script';
import Providers from './providers';
import { getShell, siteUrl } from '@/lib/api-server';
import AnnouncementBar from '@/components/layout/AnnouncementBar';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import CartDrawer from '@/components/cart/CartDrawer';
import Toast from '@/components/ui/Toast';
import WhatsAppButton from '@/components/layout/WhatsAppButton';
import RevealObserver from '@/components/motion/RevealObserver';

export async function generateMetadata() {
  const shell = await getShell().catch(() => null);
  const seo = shell?.settings?.seo || {};
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: seo.homeTitle || 'DareDevil Gears', template: '%s | DareDevil Gears' },
    description: seo.homeDescription,
    applicationName: 'DareDevil Gears',
    openGraph: { type: 'website', siteName: 'DareDevil Gears', locale: 'en_IN', images: seo.ogImage ? [seo.ogImage] : undefined },
    twitter: { card: 'summary_large_image' },
    verification: shell?.settings?.analytics?.gscVerification ? { google: shell.settings.analytics.gscVerification } : undefined,
  };
}

export const viewport = { themeColor: '#121614', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }) {
  const shell = await getShell().catch(() => ({ settings: {}, categories: [], navigation: {}, pages: [] }));
  const { settings } = shell;
  const ga = settings?.analytics?.ga4Id;
  const biz = settings?.business || {};

  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        {/* turns on scroll-reveal styles only when JS runs and the visitor has not asked for reduced motion */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('motion-ok')}catch(e){}" }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-white focus:px-4 focus:py-2">
          Skip to content
        </a>
        <Providers>
          {settings?.announcement?.isActive && settings.announcement.text ? <AnnouncementBar text={settings.announcement.text} href={settings.announcement.href} /> : null}
          <Header categories={shell.categories} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer shell={shell} />
          <CartDrawer />
          <Toast />
          <RevealObserver />
          {biz.whatsapp ? <WhatsAppButton number={biz.whatsapp} /> : null}
        </Providers>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'DareDevil Gears',
              url: siteUrl(),
              logo: `${siteUrl()}/brand/logo_theme2.png`,
              email: biz.email || undefined,
              telephone: biz.phone || undefined,
            }).replace(/</g, '\\u003c'),
          }}
        />
        {ga ? (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
            <Script id="ga4" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${ga.replace(/[^A-Z0-9-]/g, '')}',{anonymize_ip:true});`}</Script>
          </>
        ) : null}
      </body>
    </html>
  );
}
