"use client"

import React, { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, Search } from 'lucide-react'
import { Sidebar } from './Sidebar'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Komuta Merkezi',
  '/harita': 'Lead Radar',
  '/radar': 'Lead Radar',
  '/pipeline': 'Müşteri Akışı',
  '/projects': 'Proje Takibi',
  '/services': 'Hizmetlerim',
  '/bilgi': 'Bilgi Merkezi',
  '/icraat-firsatlari': 'İcraat Fırsatları',
  '/konsey': 'Konsey',
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
        <header className="h-[52px] border-b border-[var(--border-subtle)] flex items-center justify-between px-5 shrink-0 bg-[var(--bg-base)]">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--text-muted)]">Dashboard</span>
            <span className="text-[var(--text-muted)]">/</span>
            <span className="text-[var(--text-primary)] font-semibold">{pageTitle}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                placeholder="Ara..."
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs py-2 pl-9 pr-3 outline-none focus:border-[var(--accent)] text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] transition-all"
              />
            </div>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all relative">
              <Bell className="w-4 h-4" />
              <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
