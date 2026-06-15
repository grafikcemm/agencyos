"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Map,
  GitMerge,
  Briefcase,
  BookOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  Users,
  CalendarClock,
  Package,
  Target,
  Compass,
  Sun,
  TrendingUp,
  GraduationCap,
  Wallet,
  Flame,
  Sparkles
} from 'lucide-react'

// Sidebar en tepesindeki sabit alışkanlık takibi linki (kullanıcının en kritik yüzeyi).
const TOP_ITEM = { label: 'Alışkanlıklar', icon: Flame, href: '/aliskanliklar' }

const NAV_GROUPS = [
  {
    title: 'YAŞAM',
    items: [
      { label: 'Günlük',    icon: Sun,           href: '/gunluk' },
      { label: 'Gelişim',   icon: TrendingUp,    href: '/gelisim' },
      { label: 'Akademi',   icon: GraduationCap, href: '/akademi' },
      { label: 'Kütüphane', icon: BookOpen,      href: '/kutuphane' },
      { label: 'Finans',    icon: Wallet,        href: '/finans' },
    ]
  },
  {
    title: 'KOMUTA',
    items: [
      { label: 'Command Center', icon: LayoutDashboard, href: '/command-center' },
      { label: 'Asistan',        icon: Sparkles,        href: '/asistan' },
      { label: 'Ajanlar',        icon: Users,           href: '/agents' },
    ]
  },
  {
    title: 'PIPELINE',
    items: [
      { label: 'Lead Radar',        icon: Map,       href: '/harita' },
      { label: 'Pipeline',          icon: GitMerge,  href: '/pipeline' },
      { label: 'Projeler',          icon: Briefcase, href: '/projects' },
      { label: 'Hizmetlerim',       icon: Package,   href: '/services' },
      { label: 'İcraat Fırsatları', icon: Target,    href: '/icraat-firsatlari' },
      { label: 'Kariyer Radarı',    icon: Compass,   href: '/kariyer' },
    ]
  }
]

// Alt SİSTEM bloğu — Ayarlar + taşınan iki sayfa.
const SYSTEM_ITEMS = [
  { label: 'Zamanlanmış İşler', icon: CalendarClock, href: '/schedule' },
  { label: 'Bilgi Hazinesi',    icon: BookOpen,      href: '/bilgi' },
  { label: 'Ayarlar',           icon: Settings,      href: '/settings' },
]

interface SidebarProps {
  isCollapsed: boolean
  onToggle: () => void
  /** Called when a nav link is clicked — used to close the mobile drawer. */
  onNavigate?: () => void
}

export function Sidebar({ isCollapsed, onToggle, onNavigate }: SidebarProps) {
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
            <span className="font-display text-base font-semibold text-[var(--text-primary)] tracking-tight">Grafikcem</span>
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
        {/* EN TEPE: Alışkanlık Takibi (en kritik yüzey) */}
        <div className="flex flex-col gap-0.5 pb-1 mb-1 border-b border-white/5">
          {(() => {
            const isActive = pathname === TOP_ITEM.href || pathname.startsWith(TOP_ITEM.href + '/')
            const Icon = TOP_ITEM.icon
            return (
              <Link
                href={TOP_ITEM.href}
                onClick={onNavigate}
                title={isCollapsed ? TOP_ITEM.label : undefined}
                className={`flex items-center gap-3 px-2.5 py-2.5 rounded-lg transition-all duration-200 ${
                  isCollapsed ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'text-[var(--text-primary)] bg-[var(--accent-muted)] font-bold ring-1 ring-inset ring-[var(--accent)]/30'
                    : 'text-[#c9c8d3] hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`w-[18px] h-[18px] shrink-0 transition-transform duration-200 ${isActive ? 'text-[var(--accent)] scale-110' : 'text-[var(--accent)]/70'}`} />
                {!isCollapsed && <span className="text-[13px] font-bold truncate tracking-wide">{TOP_ITEM.label}</span>}
              </Link>
            )
          })()}
        </div>
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            {!isCollapsed && (
              <div className="label-eyebrow px-2.5 mb-2">
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
                    onClick={onNavigate}
                    title={isCollapsed ? item.label : undefined}
                    className={`flex items-center gap-3 px-2.5 py-2.5 rounded-lg transition-all duration-200 ${
                      isCollapsed ? 'justify-center' : ''
                    } ${
                      isActive
                        ? 'text-[var(--text-primary)] bg-[var(--accent-muted)] font-semibold ring-1 ring-inset ring-[var(--accent)]/25'
                        : 'text-[#8e8d99] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <item.icon className={`w-[18px] h-[18px] shrink-0 transition-transform duration-200 ${isActive ? 'text-[var(--accent)] scale-105' : 'text-[#5f5f69]'}`} />
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
          <div className="label-eyebrow px-2.5 mb-2">
            SİSTEM
          </div>
        )}
        {SYSTEM_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={isCollapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-2.5 py-2.5 rounded-lg transition-all duration-200 ${
                isCollapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'text-[#f5f5f7] bg-[var(--accent-muted)] border-l-2 border-[var(--accent)] font-bold'
                  : 'text-[#8e8d99] hover:text-white hover:bg-white/5'
              }`}
            >
              <item.icon className={`w-[18px] h-[18px] shrink-0 transition-transform duration-200 ${isActive ? 'text-[var(--accent)] scale-105' : 'text-[#5f5f69]'}`} />
              {!isCollapsed && <span className="text-[13px] font-semibold truncate tracking-wide">{item.label}</span>}
            </Link>
          )
        })}

        {!isCollapsed && (
          <div className="mt-4 pt-4 border-t border-white/5 px-2.5 flex items-center gap-3">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center text-xs font-black text-white shadow-md shadow-[var(--accent)]/25">
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
