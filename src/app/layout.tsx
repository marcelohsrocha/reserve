import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Reservas de Salas – IPI Dourados',
  description: 'Sistema de reservas de salas da Igreja Presbiteriana Independente de Dourados',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1f4e79' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
