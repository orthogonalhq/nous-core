import { RootProvider } from 'fumadocs-ui/provider/next';
import { Fira_Code, IBM_Plex_Mono, Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import './globals.css';

const inter = Inter({
  display: 'swap',
  variable: '--font-inter',
  subsets: ['latin'],
});

const firaCode = Fira_Code({
  display: 'swap',
  variable: '--font-fira-code',
  subsets: ['latin'],
});

const ibmPlexMono = IBM_Plex_Mono({
  display: 'swap',
  variable: '--font-ibm-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: {
    default: 'NueOS Documentation',
    template: '%s | NueOS Documentation',
  },
  description: 'Documentation for the local-first NueOS agent operating system',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${firaCode.variable} ${ibmPlexMono.variable} flex min-h-screen flex-col antialiased`}
      >
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
