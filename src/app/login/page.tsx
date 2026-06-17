"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        router.replace('/harita')
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Giriş başarısız.')
      }
    } catch {
      setError('Bağlantı hatası.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[var(--bg-base)] px-4">
      <div
        aria-hidden
        className="glow-bg top-[-10%] left-1/2 -translate-x-1/2 h-[420px] w-[900px] max-w-full opacity-70"
      />

      <form
        onSubmit={handleSubmit}
        className="glass-card glass-glow relative z-10 w-full max-w-sm rounded-2xl p-7 space-y-5"
      >
        <div className="text-center space-y-1.5">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-muted)] border border-[var(--accent)]/30">
            <Lock className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <h1 className="font-display text-xl font-semibold text-[var(--text-primary)]">Grafikcem Agency</h1>
          <p className="text-xs text-[var(--text-muted)]">Komuta Merkezi · Operatör Girişi</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="label-eyebrow block">Parola</label>
          <input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] placeholder:text-[var(--text-muted)]"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || password.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-pill bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--accent-hover)] active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
        </button>
      </form>
    </main>
  )
}
