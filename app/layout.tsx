import type { Metadata } from 'next'
import './globals.css'
import './booking.css'

export const metadata: Metadata = {
  title: 'BMWcodes LLC | BMW Coding & ECU Tuning',
  description: 'BMW coding, diagnostics, ECU/DME unlocks, tuning, performance installs, repairs and service in Queens, NY.',
  icons: { icon: '/icon.jpg', shortcut: '/icon.jpg' },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
