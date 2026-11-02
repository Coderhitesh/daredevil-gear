import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './globals.css';
import Providers from './providers';

export const metadata = {
  title: { default: 'Admin', template: '%s · DDG Admin' },
  robots: { index: false, follow: false, nocache: true },
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#151716' };

export default function RootLayout({ children }) {
  return (
    <html lang="en-IN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
