import React from 'react'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted'
  className?: string
}

export function Badge({ children, variant = 'default', className = "" }: BadgeProps) {
  const variants = {
    default: 'bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent)]',
    success: 'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/30',
    warning: 'bg-[#BA7517]/10 text-[#BA7517] border-[#BA7517]/30',
    danger: 'bg-[#A32D2D]/10 text-[#A32D2D] border-[#A32D2D]/30',
    info: 'bg-[#378ADD]/10 text-[#378ADD] border-[#378ADD]/30',
    muted: 'bg-[var(--bg-base)] text-[var(--text-muted)] border-[var(--border-subtle)]',
  }

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}
