"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Radar,
  GitMerge,
  Briefcase,
  Package,
  Settings,
  Plus,
} from 'lucide-react'

const navItems = [
  { label: 'Komuta Merkezi', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Lead Radar', icon: Radar, href: '/radar' },
  { label: 'Müşteri Akışı', icon: GitMerge, href: '/pipeline' },
  { label: 'Proje Takibi', icon: Briefcase, href: '/projects' },
  { label: 'Hizmetlerim', icon: Package, href: '/services' },
]

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full py-4">
      {/* Toggle / Logo */}
      <div className={`flex items-center mb-8 px-3 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        {!isCollapsed && (
          <span className="font-bold text-sm text-[var(--text-primary)] tracking-tight">Grafikcem</span>
        )}
        <button
          onClick={onToggle}
          title={isCollapsed ? 'Genişlet' : 'Daralt'}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-all shrink-0"
        >
          <Plus className="w-4 h-4 text-black" strokeWidth={2.5} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-0.5 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              className={`flex items-center gap-3 p-2.5 rounded-xl transition-all duration-150 ${
                isCollapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'text-[var(--accent)] bg-[var(--accent-muted)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom: Settings */}
      <div className="flex flex-col gap-0.5 px-2 pb-2">
        <Link
          href="/settings"
          title={isCollapsed ? 'Sistem Ayarları' : undefined}
          className={`flex items-center gap-3 p-2.5 rounded-xl transition-all duration-150 ${
            isCollapsed ? 'justify-center' : ''
          } ${
            pathname === '/settings'
              ? 'text-[var(--accent)] bg-[var(--accent-muted)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
          }`}
        >
          <Settings className="w-5 h-5 shrink-0" />
          {!isCollapsed && <span className="text-sm font-medium truncate">Sistem Ayarları</span>}
        </Link>

        {!isCollapsed && (
          <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] px-1">
            <div className="text-[11px] font-medium text-[var(--text-secondary)] truncate">
              admin@grafikcem.com
            </div>
            <div className="text-[9px] text-[var(--text-muted)] mt-0.5 uppercase tracking-wider">
              v1.0.0
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
