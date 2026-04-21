"use client"

import { Building2, LogOut } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { usePathname } from 'next/navigation'

interface TopBarProps {
  title?: string
  subtitle?: string
}

export function TopBar() {
  const pathname = usePathname()
  
  let title = 'DASHBOARD'
  let subtitle = 'GELİR YOLCULUĞU'

  if (pathname.includes('/map')) { title = 'HARİTA'; subtitle = 'KEŞİF' }
  else if (pathname.includes('/pipeline')) { title = 'PİPELİNE'; subtitle = 'CRM' }
  else if (pathname.includes('/projects')) { title = 'PROJELER'; subtitle = 'YÖNETİM' }
  else if (pathname.includes('/playbooks')) { title = 'PLAYBOOKS'; subtitle = 'SERVİSLER' }
  else if (pathname.includes('/settings')) { title = 'AYARLAR'; subtitle = 'SİSTEM' }

  return (
    <header className="h-[72px] shrink-0 flex items-center justify-between px-8 border-b border-[var(--border-color)] bg-[#050810] font-mono">
      {/* Left Menu / Breadcrumb */}
      <div className="flex items-center gap-2">
        <span className="text-[var(--text-secondary)] text-sm">{subtitle} /</span>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-wide uppercase">{title}</h1>
      </div>

      {/* Center Action */}
      <div className="flex-1 flex justify-center pb-8 pt-4">
        {/* Placeholder for center content if needed */}
        <p className="text-[10px] text-[var(--text-muted)] tracking-[0.2em] uppercase hidden md:block mt-1">
          Ajans operasyonlarını yapay zeka ile otomatikleştir
        </p>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        <div className="hidden lg:flex items-center gap-3 mr-4 px-3 py-1.5 rounded-full border border-[var(--border-color)] bg-[var(--bg-elevated)]">
          <div className="w-2 h-2 rounded-full bg-[var(--os-green)] shadow-[0_0_8px_var(--os-green)]"></div>
          <span className="text-[10px] text-[var(--text-secondary)] tracking-widest font-bold">GEMİNİ: HAZIR</span>
        </div>

        <button className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--bg-card)] border border-[var(--border-color)] rounded-sm transition-colors group text-[11px] font-bold text-[var(--text-primary)] tracking-wider">
          <Building2 className="w-3.5 h-3.5 text-[var(--os-accent)] group-hover:text-[var(--os-accent-hover)]" />
          YÖNETİM KURULU
        </button>

        <div className="flex items-center gap-3 pl-4 border-l border-[var(--border-color)]">
          <span className="text-[11px] text-[var(--text-secondary)] hidden xl:block">
            admin@grafikcem.com
          </span>
          <button className="flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--os-red)] transition-colors px-2 py-1.5 rounded-sm">
            <span className="text-[11px] font-bold tracking-wider">ÇIKIŞ</span>
          </button>
        </div>
      </div>
    </header>
  )
}
