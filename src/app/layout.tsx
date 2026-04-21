import type { Metadata } from 'next'
import { Geist_Mono } from 'next/font/google'
import './globals.css'

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Agency OS // Komuta Merkezi',
  description: 'AI destekli ajans yönetim sistemi',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="tr" className={`${geistMono.variable} h-full dark`}>
      <body className="min-h-full bg-[#050810] text-[#e8eaf0] antialiased">
        {children}
      </body>
    </html>
  )
}
