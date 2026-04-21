interface StatusBadgeProps {
  text: string
  variant?: 'success' | 'warning' | 'error' | 'neutral' | 'cyan'
  pulse?: boolean
}

export function StatusBadge({ text, variant = 'neutral', pulse = false }: StatusBadgeProps) {
  const styles = {
    success: 'border-[var(--os-green)] text-[var(--os-green)]',
    warning: 'border-[var(--os-accent)] text-[var(--os-accent)]',
    error: 'border-[var(--os-red)] text-[var(--os-red)]',
    neutral: 'border-[var(--text-muted)] text-[var(--text-secondary)]',
    cyan: 'border-[var(--os-cyan)] text-[var(--os-cyan)]',
  }

  return (
    <div className={`px-2 py-0.5 border rounded-sm text-[9px] font-bold tracking-[0.1em] uppercase whitespace-nowrap flex items-center gap-1.5 ${styles[variant]}`}>
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
            variant === 'success' ? 'bg-[var(--os-green)]' : 
            variant === 'cyan' ? 'bg-[var(--os-cyan)]' : 
            variant === 'error' ? 'bg-[var(--os-red)]' : 
            'bg-[var(--os-accent)]'
          }`}></span>
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
            variant === 'success' ? 'bg-[var(--os-green)]' : 
            variant === 'cyan' ? 'bg-[var(--os-cyan)]' : 
            variant === 'error' ? 'bg-[var(--os-red)]' : 
            'bg-[var(--os-accent)]'
          }`}></span>
        </span>
      )}
      {text}
    </div>
  )
}
