import React from 'react'

interface ProgressBarProps {
  progress: number // 0-100
  className?: string
}

export function ProgressBar({ progress, className = "" }: ProgressBarProps) {
  const percentage = Math.min(Math.max(progress, 0), 100)

  return (
    <div className={`h-2 w-full bg-black/20 rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full bg-[var(--accent)] transition-all duration-500 ease-out rounded-full"
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}
