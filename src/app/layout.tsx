import type { Metadata } from 'next'
import { Inter, Inter_Tight, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

// Gövde metni (FTG "Sakin Karanlık Editöryel" sistemi)
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

// Editöryel başlık (büyük, ağır) — "Günaydın, Cem"
const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  weight: ['500', '600', '700', '800'],
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
      className={`${inter.variable} ${interTight.variable} ${plexMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
