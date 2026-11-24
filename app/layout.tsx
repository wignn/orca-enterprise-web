import type { Metadata } from 'next';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';

export const metadata: Metadata = {
  title: 'ORCA Enterprise — Windows Desktop Market Terminal',
  description:
    'Windows x64 market terminal with live quotes, multi-panel charts, order book depth, cross-asset heatmaps, and macro data in one desktop app.',
  icons: {
    icon: '/orca-favicon.png',
    apple: '/orca-favicon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-void text-ivory selection:bg-amber-orca/25 selection:text-ivory">
        <TooltipProvider delayDuration={120}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
