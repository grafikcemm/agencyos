import React from 'react'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted'
  className?: string
}

export function Badge({ children, variant = 'default', className = "" }: BadgeProps) {
  const variants = {
    default: 'bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent)]',
    success: 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/30',
    warning: 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/30',
    danger: 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/30',
    info: 'bg-[var(--info)]/10 text-[var(--info)] border-[var(--info)]/30',
    muted: 'bg-[var(--bg-base)] text-[var(--text-muted)] border-[var(--border-subtle)]',
  }

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}
