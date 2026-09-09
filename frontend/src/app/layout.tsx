import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import TermsBanner from '@/components/TermsBanner';
import { Providers } from './providers';
import { SITE_URL } from '@/lib/legal';

const inter = Inter({ subsets: ['latin'] });

const DESCRIPTION = 'NeedCreator met en relation les marques et des créateurs UGC vérifiés. Publiez un brief, recevez des devis avec portfolio vidéo, payez uniquement à la validation. Commission unique de 10 %.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'NeedCreator : plateforme UGC pour marques et créateurs',
    template: '%s | NeedCreator',
  },
  description: DESCRIPTION,
  keywords: ['UGC', 'vidéo UGC', 'créateurs de contenu', 'user generated content', 'marketing d\'influence', 'plateforme UGC France', 'contenu authentique', 'TikTok', 'Instagram'],
  applicationName: 'NeedCreator',
  authors: [{ name: 'NeedCreator' }],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'NeedCreator',
    title: 'NeedCreator : plateforme UGC pour marques et créateurs',
    description: DESCRIPTION,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NeedCreator : plateforme UGC pour marques et créateurs',
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  icons: {
    icon: [{ url: '/favicon.ico', sizes: '32x32' }, { url: '/icon.svg', type: 'image/svg+xml' }],
    apple: '/apple-icon',
  },
};

export const viewport: Viewport = {
  themeColor: '#05ddb2',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={`${inter.className} min-h-screen flex flex-col`}>
        <Providers>
          <Header />
          <TermsBanner />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
