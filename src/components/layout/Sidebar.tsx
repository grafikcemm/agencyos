"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Map,
  GitMerge,
  Briefcase,
  Package,
  BookOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  Users,
  Target
} from 'lucide-react'

const NAV_GROUPS = [
  {
    title: 'DASHBOARDS',
    items: [
      { label: 'Dashboard',  icon: LayoutDashboard, href: '/dashboard' },
      { label: 'Harita',     icon: Map,              href: '/harita' },
      { label: 'Pipeline',   icon: GitMerge,         href: '/pipeline' },
      { label: 'Projeler',   icon: Briefcase,        href: '/projects' },
    ]
  },
  {
    title: 'ARAÇLAR',
    items: [
      { label: 'Hizmetlerim', icon: Package,  href: '/services' },
      { label: 'İcraat Fırsatları', icon: Target, href: '/icraat-firsatlari' },
      { label: 'Bilgi',       icon: BookOpen,  href: '/bilgi' },
      { label: 'Konsey',      icon: Users,     href: '/konsey' },
    ]
  }
]

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full py-4">
      {/* Logo + Toggle */}
      <div className={`flex items-center mb-6 px-3 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center">
              <Zap className="w-4 h-4 text-black" />
            </div>
            <span className="font-bold text-sm text-[var(--text-primary)] tracking-tight">Grafikcem</span>
          </div>
        )}
        {isCollapsed && (
          <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center">
            <Zap className="w-4 h-4 text-black" />
          </div>
        )}
      </div>

      {/* Toggle button */}
      <div className={`px-3 mb-4 ${isCollapsed ? 'flex justify-center' : ''}`}>
        <button
          onClick={onToggle}
          title={isCollapsed ? 'Genişlet' : 'Daralt'}
          className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all"
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 flex flex-col gap-5 px-2 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            {!isCollapsed && (
              <div className="text-[9px] font-bold text-[var(--text-muted)] tracking-[0.15em] uppercase px-2.5 mb-2">
                {group.title}
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={isCollapsed ? item.label : undefined}
                    className={`flex items-center gap-3 px-2.5 py-2.5 rounded-lg transition-all duration-200 ${
                      isCollapsed ? 'justify-center' : ''
                    } ${
                      isActive
                        ? 'text-[#f5f5f7] bg-white/10 border-l-4 border-[#ff4e17] font-bold shadow-[inset_1px_0_0_rgba(255,78,23,0.1)]'
                        : 'text-[#8e8d99] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <item.icon className={`w-[18px] h-[18px] shrink-0 transition-transform duration-200 ${isActive ? 'text-[#ff4e17] scale-110' : 'text-[#5f5f69]'}`} />
                    {!isCollapsed && <span className="text-[13px] font-semibold truncate tracking-wide">{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>



      {/* Bottom: Settings */}
      <div className="flex flex-col gap-0.5 px-2 mt-auto">
        {!isCollapsed && (
          <div className="text-[9px] font-bold text-[#5f5f69] tracking-[0.15em] uppercase px-2.5 mb-2">
            SİSTEM
          </div>
        )}
        <Link
          href="/settings"
          title={isCollapsed ? 'Ayarlar' : undefined}
          className={`flex items-center gap-3 px-2.5 py-2.5 rounded-lg transition-all duration-200 ${
            isCollapsed ? 'justify-center' : ''
          } ${
            pathname === '/settings'
              ? 'text-[#f5f5f7] bg-white/10 border-l-4 border-[#ff4e17] font-bold shadow-[inset_1px_0_0_rgba(255,78,23,0.1)]'
              : 'text-[#8e8d99] hover:text-white hover:bg-white/5'
          }`}
        >
          <Settings className={`w-[18px] h-[18px] shrink-0 transition-transform duration-200 ${pathname === '/settings' ? 'text-[#ff4e17] scale-110' : 'text-[#5f5f69]'}`} />
          {!isCollapsed && <span className="text-[13px] font-semibold truncate tracking-wide">Ayarlar</span>}
        </Link>

        {!isCollapsed && (
          <div className="mt-4 pt-4 border-t border-white/5 px-2.5 flex items-center gap-3">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#ff4e17] to-[#ff8c05] flex items-center justify-center text-xs font-black text-black shadow-md shadow-[#ff4e17]/25">
                GC
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#22c55e] border-2 border-[#08080a]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-[#f5f5f7] truncate">
                Cem Grafik
              </div>
              <div className="text-[9px] text-[#5f5f69] font-black uppercase tracking-wider truncate">
                Kurucu & CEO
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
