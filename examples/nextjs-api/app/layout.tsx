import type { ReactNode } from 'react';

export const metadata = {
  title: 'PayGate × Next.js',
  description: 'PayGate example: Next.js App Router with x402 paywall.',
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
