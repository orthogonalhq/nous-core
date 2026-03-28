import type { Metadata } from 'next';
import { Providers } from './providers';
import '@nous/ui/styles';
import '@nous/ui/styles/nous-dark';
import '@vscode/codicons/dist/codicon.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nous',
  description: 'Neural Operations Unification System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
