import type { Metadata } from 'next'
import { Inter, Inter_Tight, IBM_Plex_Mono, Geist } from 'next/font/google'
import './globals.css'

// Gövde metni (Inter Variable + OpenType char varyantları — Framer body sesi)
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

// Editöryel başlık fallback (Inter Tight) — Geist yoksa display bunu kullanır
const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  weight: ['500', '600', '700', '800'],
})

// Framer display ikamesi: Geist (geometrik grotesk, GT Walsheim'a en yakın
// açık kaynak). Agresif negatif tracking ile poster hissi taşır.
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
})

// Zaman / etiket / data — timeline omurgası, mono numerikler
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'Grafikcem OS // Komuta Merkezi',
  description: 'Kişisel iş, yaşam ve gelişim işletim sistemi',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="tr"
      className={`${inter.variable} ${interTight.variable} ${plexMono.variable} ${geist.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
