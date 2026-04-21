"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { id: 'map', abbr: 'MC', label: 'HARİTA + JARVIS', href: '/map' },
  { id: 'pipeline', abbr: 'PL', label: 'CRM PİPELİNE', href: '/pipeline' },
  { id: 'dashboard', abbr: 'OP', label: 'DASHBOARD', href: '/dashboard' },
  { id: 'projects', abbr: 'PJ', label: 'PROJELER', href: '/projects' },
  { id: 'playbooks', abbr: 'PB', label: 'OYUN KİTAPLARI', href: '/playbooks' },
  { id: 'settings', abbr: '??', label: 'AYARLAR', href: '/settings' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-[260px] h-full bg-[#050810] border-r border-[var(--border-color)] flex flex-col shrink-0 font-mono">
      {/* Header / Logo */}
      <div className="pt-6 pb-4 px-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-[var(--os-accent)] rounded-sm flex items-center justify-center text-[#050810] font-bold text-lg">
            A
          </div>
          <div>
            <div className="text-[var(--text-primary)] font-bold tracking-widest text-sm">AGENCYOS</div>
            <div className="text-[var(--os-cyan)] text-[9px] tracking-[0.2em] mt-0.5 opacity-80">// COMMAND INTERFACE</div>
          </div>
        </div>

        {/* Action Toggle */}
        <div className="flex bg-[#0a0d16] p-1 rounded-sm border border-[var(--border-color)]">
          <button className="flex-1 bg-[var(--os-accent)] text-[#050810] text-xs font-bold py-1.5 rounded-sm tracking-wide">
            AJANS
          </button>
          <button className="flex-1 text-[var(--text-secondary)] text-xs font-bold py-1.5 hover:text-[var(--text-primary)] transition-colors tracking-wide cursor-not-allowed opacity-50">
            MÜŞTERİ
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 flex flex-col gap-1 px-3">
        <div className="mb-4"></div> {/* Spacing */}
        
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (pathname === '/' && item.id === 'dashboard')
          
          return (
            <Link
              key={item.id}
              href={item.href}
            >
              <div className={`group flex items-center px-4 py-2.5 rounded-sm relative transition-all duration-200 ${
                isActive ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-card)]'
              }`}>
                {/* Active Indicator Line */}
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--os-accent)] rounded-r-md"></div>
                )}
                
                <span className={`text-[11px] font-bold w-7 shrink-0 ${
                  isActive ? 'text-[var(--os-accent)]' : 'text-[var(--text-secondary)] group-hover:text-[var(--os-accent-hover)]'
                }`}>
                  {item.abbr}
                </span>
                
                <span className={`text-xs tracking-wide font-medium ${
                  isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                }`}>
                  {item.label}
                </span>
              </div>
            </Link>
          )
        })}
      </nav>
      
      {/* Footer info (optional) */}
      <div className="p-4 border-t border-[var(--border-color)] text-center">
        <div className="text-[10px] text-[var(--text-muted)] tracking-widest">v0.1.0-alpha</div>
      </div>
    </aside>
  )
}
