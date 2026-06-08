"use client"

import { useCallback, useState } from 'react'

// Result shape returned by POST /api/agents/directive (mirrors
// DirectiveResult in src/lib/agents/orchestrator.ts).
export interface DirectiveResult {
  directiveId: string
  status: 'done' | 'error'
  debrief: string
  taskCount: number
  error?: string
}

export interface UseDirective {
  running: boolean
  result: DirectiveResult | null
  error: string | null
  // Human-readable label of what is being dispatched (e.g. an offer/opportunity name).
  label: string | null
  run: (input: string, label?: string) => Promise<void>
  reset: () => void
}

// Shared client helper for firing an operator directive at the agent engine.
// Used by Hizmetlerim and İcraat Fırsatları so the network/ orchestration logic
// lives in one place. Auth is a local no-op, so credentials: 'include' is enough.
export function useDirective(): UseDirective {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<DirectiveResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState<string | null>(null)

  const run = useCallback(
    async (input: string, lbl?: string) => {
      if (!input.trim() || running) return
      setRunning(true)
      setError(null)
      setResult(null)
      setLabel(lbl ?? null)
      try {
        const res = await fetch('/api/agents/directive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ input }),
        })
        const data = (await res.json().catch(() => null)) as DirectiveResult | { error?: string } | null
        if (!res.ok) {
          const msg = data && 'error' in data && data.error ? data.error : 'Direktif çalıştırılamadı'
          throw new Error(msg)
        }
        setResult(data as DirectiveResult)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Bir hata oluştu')
      } finally {
        setRunning(false)
      }
    },
    [running]
  )

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
    setLabel(null)
  }, [])

  return { running, result, error, label, run, reset }
}
