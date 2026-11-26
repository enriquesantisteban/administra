import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Administra | Control de alquileres',
  description: 'Tu histórico de alquileres y gastos, claro y organizado por año.',
  generator: 'v0.app',
  icons: {
    icon: [{ url: '/apple-icon.png', type: 'image/png' }],
    shortcut: '/apple-icon.png',
    apple: [{ url: '/apple-icon.png', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  userScalable: true,
  colorScheme: 'light',
  themeColor: '#f7f7f4',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
