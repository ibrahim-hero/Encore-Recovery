import type { Metadata, Viewport } from 'next'
import { Inter, Manrope } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', weight: ['600', '700', '800'] })

export const metadata: Metadata = {
  title: 'Encore Recovery — PayPal sandbox refund recovery',
  description:
    'Encore Recovery reconciles paid-but-unfulfilled bookings against PayPal Sandbox and executes verified, idempotent refunds with an evidence receipt.',
}

export const viewport: Viewport = {
  themeColor: '#f5f3ee',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-background">
      <body className={`${inter.variable} ${manrope.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
