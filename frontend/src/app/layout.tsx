import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import LangTranslator from '@/components/LangTranslator';
import TermsBanner from '@/components/TermsBanner';
import EmailVerificationBanner from '@/components/EmailVerificationBanner';
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
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Anglais : la page reste masquée le temps de la traduction (au plus 3 s), pour ne pas voir le français d'abord */}
        <script dangerouslySetInnerHTML={{ __html: `try{var c=document.cookie,ch=/(?:^|; )nc_lang_set=1/.test(c),l=ch?((c.match(/(?:^|; )nc_lang=(fr|en)/)||[])[1]):null,q=new URLSearchParams(location.search).get('lang');if(!l)l=q==='en'||q==='fr'?q:((navigator.language||'').toLowerCase().indexOf('fr')===0||!navigator.language?'fr':'en');if(l==='en'&&location.pathname.indexOf('/admin')!==0){document.documentElement.classList.add('nc-en-pending');setTimeout(function(){document.documentElement.classList.remove('nc-en-pending')},3000)}}catch(e){}` }} />
      </head>
      <body className={`${inter.className} min-h-screen flex flex-col`}>
        <Providers>
          <LangTranslator />
          <Header />
          <TermsBanner />
          <EmailVerificationBanner />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
