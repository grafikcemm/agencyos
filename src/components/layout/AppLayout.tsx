"use client"

import React, { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, Search } from 'lucide-react'
import { Sidebar } from './Sidebar'

const PAGE_TITLES: Record<string, string> = {
  '/command-center': 'Command Center',
  '/agents': 'Ajanlar',
  '/tasks': 'Görev Kuyruğu',
  '/schedule': 'Zamanlama',
  '/dashboard': 'Komuta Merkezi',
  '/harita': 'Lead Radar',
  '/radar': 'Lead Radar',
  '/pipeline': 'Müşteri Akışı',
  '/projects': 'Proje Takibi',
  '/services': 'Hizmetlerim',
  '/bilgi': 'Bilgi Merkezi',
  '/icraat-firsatlari': 'İcraat Fırsatları',
  '/settings': 'Sistem Ayarları'
}

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const pathname = usePathname()
  const pageTitle = PAGE_TITLES[pathname] ?? 'Dashboard'

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      <aside
        className="shrink-0 bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] transition-all duration-300"
        style={{ width: sidebarCollapsed ? '64px' : '220px' }}
      >
        <Sidebar isCollapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="relative z-20 h-[60px] border-b border-[var(--border-subtle)] flex items-center justify-between px-6 shrink-0 bg-[var(--bg-base)]/70 backdrop-blur-xl">
          <div className="flex items-baseline gap-2.5">
            <span className="text-[11px] text-[var(--text-muted)] tracking-wide">Dashboard /</span>
            <h1 className="font-display text-lg font-medium text-[var(--text-primary)] leading-none">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-60">
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

        <main className="relative flex-1 overflow-hidden">
          <div
            aria-hidden
            className="glow-bg top-0 left-1/2 -translate-x-1/2 h-[420px] w-[1100px] max-w-full opacity-70"
          />
          <div className="relative z-10 h-full">{children}</div>
        </main>
      </div>
    </div>
  )
}
