'use client'

// Telegram durum paneli (Faz B7) — READ-ONLY teşhis: bot kimliği, webhook kaydı,
// beklenen URL eşleşmesi, son hata, bekleyen update sayısı, son giriş/çıkış.
// Token/secret ASLA gösterilmez. setWebhook butonu YOK — webhook kaydı yalnız
// kullanıcı deploy sonrası açıkça isterse ayrı bir adımda yapılır.

import { useEffect, useState } from 'react'
import { Send, RefreshCw } from 'lucide-react'

interface Diag {
  bot: { id?: number; username?: string | null; error?: string }
  webhook: {
    registered?: boolean
    url?: string | null
    expectedUrl?: string | null
    urlMatchesExpected?: boolean | null
    pendingUpdateCount?: number
    lastErrorMessage?: string | null
    lastErrorDate?: string | null
    error?: string
  }
  lastSuccessfulInboundAt: string | null
  lastSuccessfulOutboundAt: string | null
  env: Record<string, boolean>
}

function Row({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[12px] py-1">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={`font-medium ${bad ? 'text-red-400' : 'text-[var(--text-secondary)]'}`}>{value}</span>
    </div>
  )
}

export function TelegramDiagnostics() {
  const [diag, setDiag] = useState<Diag | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/telegram/diagnostics')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDiag(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Dış sisteme (API) abone olan mount-fetch — repo genelindeki harita deseniyle aynı.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [])

  const fmt = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString('tr-TR') : '—'

  return (
    <div
      data-testid="telegram-diagnostics"
      className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-2"
    >
      <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
        <Send className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Telegram Asistan Durumu</h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] transition disabled:opacity-50"
          aria-label="Yenile"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error ? (
        <p className="text-[12px] text-red-400">Teşhis yüklenemedi: {error}</p>
      ) : !diag ? (
        <p className="text-[12px] text-[var(--text-muted)]">Yükleniyor…</p>
      ) : (
        <>
          <Row
            label="Bot"
            value={diag.bot.error ? `hata: ${diag.bot.error}` : `@${diag.bot.username ?? diag.bot.id ?? '?'}`}
            bad={Boolean(diag.bot.error)}
          />
          <Row
            label="Webhook kaydı"
            value={
              diag.webhook.error
                ? `hata: ${diag.webhook.error}`
                : diag.webhook.registered
                  ? 'kayıtlı'
                  : 'KAYITLI DEĞİL — inbound mesaj İŞLENMEZ'
            }
            bad={Boolean(diag.webhook.error) || !diag.webhook.registered}
          />
          {diag.webhook.registered && (
            <Row
              label="URL beklenene uygun"
              value={
                diag.webhook.urlMatchesExpected == null
                  ? 'beklenen URL bilinmiyor (APP_URL tanımsız)'
                  : diag.webhook.urlMatchesExpected
                    ? 'evet'
                    : `HAYIR — kayıtlı: ${diag.webhook.url ?? '—'}`
              }
              bad={diag.webhook.urlMatchesExpected === false}
            />
          )}
          <Row label="Bekleyen update" value={String(diag.webhook.pendingUpdateCount ?? '—')} />
          {diag.webhook.lastErrorMessage && (
            <Row
              label={`Son webhook hatası (${fmt(diag.webhook.lastErrorDate)})`}
              value={diag.webhook.lastErrorMessage}
              bad
            />
          )}
          <Row label="Son başarılı gelen mesaj" value={fmt(diag.lastSuccessfulInboundAt)} />
          <Row label="Son başarılı giden mesaj" value={fmt(diag.lastSuccessfulOutboundAt)} />
          <div className="pt-2 border-t border-[var(--border-subtle)]">
            {(['botTokenConfigured', 'chatIdConfigured', 'userIdConfigured', 'webhookSecretConfigured'] as const).map(
              (k) => (
                <Row
                  key={k}
                  label={
                    k === 'botTokenConfigured' ? 'TELEGRAM_BOT_TOKEN'
                    : k === 'chatIdConfigured' ? 'TELEGRAM_CHAT_ID'
                    : k === 'userIdConfigured' ? 'TELEGRAM_USER_ID (yeni — zorunlu)'
                    : 'TELEGRAM_WEBHOOK_SECRET'
                  }
                  value={diag.env[k] ? 'tanımlı' : 'EKSİK'}
                  bad={!diag.env[k]}
                />
              ),
            )}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] pt-1">
            Webhook kaydı otomatik yapılmaz — deploy sonrası açık onayınla ayrı adımda kurulur.
          </p>
        </>
      )}
    </div>
  )
}
