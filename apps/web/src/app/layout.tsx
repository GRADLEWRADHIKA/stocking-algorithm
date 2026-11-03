import type { Metadata } from 'next';
import { Public_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const sans = Public_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const num = JetBrains_Mono({ subsets: ['latin'], variable: '--font-num', display: 'swap', weight: ['400', '500', '600'] });

export const metadata: Metadata = {
  title: 'QuantDesk — Quant analysis & paper trading',
  description: 'Local-first algorithmic stock analysis, backtesting and paper trading for NSE/BSE on simulated and historical data.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${num.variable}`} suppressHydrationWarning>
      <head>
        {/* apply the saved theme before paint to avoid a flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=JSON.parse(localStorage.getItem('quantdesk-ui')||'{}').state?.theme||'dark';document.documentElement.classList.remove('dark','light');document.documentElement.classList.add(t)}catch(e){}`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
