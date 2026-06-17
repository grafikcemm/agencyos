"use client"

import React, { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, Menu, Search, X } from 'lucide-react'
import { Sidebar } from './Sidebar'

const PAGE_TITLES: Record<string, string> = {
  '/command-center': 'Command Center',
  '/agents': 'Ajanlar',
  '/tasks': 'Görev Kuyruğu',
  '/schedule': 'Zamanlama',
  '/dashboard': 'Komuta Merkezi',
  '/harita': 'Lead Radar',
  '/pipeline': 'Müşteri Akışı',
  '/projects': 'Proje Takibi',
  '/services': 'Hizmetlerim',
  '/bilgi': 'Bilgi Merkezi',
  '/icraat-firsatlari': 'İcraat Fırsatları',
  '/kariyer': 'Kariyer Radarı',
  '/settings': 'Sistem Ayarları',
  '/asistan': 'Asistan',
  '/aliskanliklar': 'Alışkanlıklar',
  '/gunluk': 'Günlük',
  '/gelisim': 'Gelişim',
  '/akademi': 'Akademi',
  '/kutuphane': 'Kütüphane',
  '/finans': 'Finans'
}

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const pathname = usePathname()
  const pageTitle = PAGE_TITLES[pathname] ?? 'Dashboard'

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Desktop sidebar */}
      <aside
        className="hidden md:block shrink-0 bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] transition-all duration-300"
        style={{ width: sidebarCollapsed ? '64px' : '220px' }}
      >
        <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
      </aside>

      {/* Mobile off-canvas sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Gezinme menüsü">
          <button
            aria-label="Menüyü kapat"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <aside className="absolute left-0 top-0 h-full w-[240px] bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] shadow-2xl animate-in slide-in-from-left duration-200">
            <button
              aria-label="Menüyü kapat"
              onClick={() => setMobileNavOpen(false)}
              className="absolute right-3 top-4 z-10 w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <X className="w-4 h-4" />
            </button>
            <Sidebar isCollapsed={false} onToggle={() => setMobileNavOpen(false)} onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="relative z-20 h-[60px] border-b border-[var(--border-subtle)] flex items-center justify-between px-4 md:px-6 shrink-0 bg-[var(--bg-base)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              aria-label="Menüyü aç"
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden w-9 h-9 flex items-center justify-center glass-pill text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all shrink-0"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-baseline gap-2.5 min-w-0">
              <span className="hidden sm:inline label-eyebrow">Grafikcem /</span>
              <h1 className="font-display text-xl font-semibold text-[var(--text-primary)] leading-none truncate tracking-tight">{pageTitle}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-60 hidden lg:block">
              <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] z-10" />
              <input
                placeholder="Ara..."
                className="glass-pill w-full text-xs py-2 pl-9 pr-3.5 outline-none focus:border-[var(--accent)] text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] transition-all"
              />
            </div>
            <button className="w-9 h-9 flex items-center justify-center glass-pill text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all relative">
              <Bell className="w-4 h-4" />
              <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_6px_var(--accent-glow)]" />
            </button>
          </div>
        </header>

        <main className="relative flex-1 overflow-y-auto">
          <div
            aria-hidden
            className="glow-bg top-0 left-1/2 -translate-x-1/2 h-[420px] w-[1100px] max-w-full opacity-70"
          />
          <div className="relative z-10 min-h-full flex flex-col">{children}</div>
        </main>
      </div>
    </div>
  )
}
