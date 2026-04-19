import type { ReactNode } from 'react';

export const metadata = {
  title: 'Limen × Next.js',
  description: 'Limen example: Next.js App Router with x402 paywall.',
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
