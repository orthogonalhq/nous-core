import { RootProvider } from 'fumadocs-ui/provider/next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Jarvis Docs',
  description: 'Internal development documentation and project management',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
