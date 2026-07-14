"use client"

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, ShieldCheck, ShieldAlert, RefreshCw, Unlink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface GmailStatus {
  connected: boolean
  verifiedEmail: string | null
  grantedScopes: string[]
  requiredScopesOk: boolean
  oauthConfigured: boolean
  realSendTransportReady: boolean
  sendEnabled: boolean
  ingestEnabled: boolean
  hasHistoryCursor: boolean
}

const CALLBACK_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  bagli: { text: '✓ Gmail hesabı bağlandı.', ok: true },
  'gecersiz-state': { text: 'OAuth state geçersiz/süresi doldu — tekrar deneyin.', ok: false },
  'state-replay': { text: 'OAuth state tekrar kullanıldı (replay) — reddedildi.', ok: false },
  'pkce-eksik': { text: 'PKCE doğrulayıcı bulunamadı — tekrar bağlanın.', ok: false },
  'token-degisimi-basarisiz': { text: 'Token değişimi başarısız.', ok: false },
  'scope-reddedildi': { text: 'İzin kümesi reddedildi — gmail.send VE gmail.readonly ikisi de gerekli.', ok: false },
  'email-dogrulanamadi': { text: 'Hesap e-postası doğrulanamadı (getProfile).', ok: false },
  'vault-hatasi': { text: 'Token güvenli kasaya yazılamadı.', ok: false },
  'eksik-parametre': { text: 'OAuth dönüşünde eksik parametre.', ok: false },
}

export function GmailConnectionPanel() {
  const queryClient = useQueryClient()
  // Aksiyon banner'ı (revoke sonucu / manuel kapatma) — render'da callback
  // param'ını EZER. setState effect içinde YOK (cascading render lint kuralı).
  const [actionBanner, setActionBanner] = useState<{ text: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  // Callback param (?gmail=...) SSR+client aynı kaynaktan (useSearchParams) →
  // hydration uyuşmazlığı yok, effect yok. Banner render'da türetilir.
  const searchParams = useSearchParams()
  const gmailParam = searchParams.get('gmail')
  const callbackBanner = gmailParam
    ? CALLBACK_MESSAGES[gmailParam] ?? { text: `Gmail: ${gmailParam}`, ok: gmailParam.startsWith('bagli') }
    : null
  const banner = actionBanner ?? callbackBanner

  const { data, isLoading } = useQuery({
    queryKey: ['gmail-status'],
    queryFn: async (): Promise<GmailStatus> => {
      const res = await fetch('/api/gmail/status')
      if (!res.ok) throw new Error('durum okunamadı')
      const json = await res.json()
      return json.status as GmailStatus
    },
    staleTime: 30_000,
  })

  const handleRevoke = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/gmail/oauth/revoke', { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        setActionBanner({ text: '✓ Bağlantı kaldırıldı.', ok: true })
        await queryClient.invalidateQueries({ queryKey: ['gmail-status'] })
      } else {
        setActionBanner({ text: json.error ?? 'Kaldırma başarısız.', ok: false })
      }
    } catch {
      setActionBanner({ text: 'Bağlantı hatası.', ok: false })
    } finally {
      setBusy(false)
    }
  }

  const connected = data?.connected ?? false

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
        <Mail className="w-3.5 h-3.5 text-[var(--accent)]" />
        <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">Gmail Bağlantısı</span>
        {connected ? (
          <Badge variant="success">Bağlı</Badge>
        ) : (
          <Badge variant="muted">Bağlı değil</Badge>
        )}
      </div>

      {banner && (
        <div className={`px-3 py-2 rounded-lg border text-[11px] font-medium ${
          banner.ok
            ? 'bg-[var(--accent-muted)] border-[var(--accent)]/30 text-[var(--accent)]'
            : 'bg-[var(--danger)]/10 border-[var(--danger)]/30 text-[var(--danger)]'
        }`}>
          {banner.text}
        </div>
      )}

      {isLoading && <p className="text-[11px] text-[var(--text-muted)] animate-pulse">Durum yükleniyor…</p>}

      {data && (
        <div className="space-y-2.5 text-xs">
          <Row label="Doğrulanmış hesap" value={data.verifiedEmail ?? '—'} />
          <StatusRow label="Zorunlu izinler (send + readonly)" ok={data.requiredScopesOk} okText="Tam" noText="Eksik" />
          <StatusRow label="OAuth yapılandırması" ok={data.oauthConfigured} okText="Hazır" noText="Env eksik (kullanıcı aksiyonu)" />
          <StatusRow label="Gerçek gönderim transport'u" ok={data.realSendTransportReady} okText="Hazır" noText="Hazır değil" />
          <StatusRow label="Gönderim bayrağı (GMAIL_SEND_ENABLED)" ok={data.sendEnabled} okText="Açık" noText="Kapalı (dry-run)" neutral />
          <StatusRow label="Inbound ingest bayrağı" ok={data.ingestEnabled} okText="Açık" noText="Kapalı" neutral />
          {data.grantedScopes.length > 0 && (
            <div className="pt-1">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">İzin kümesi</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {data.grantedScopes.map((s) => (
                  <code key={s} className="text-[9px] bg-[var(--bg-base)] px-1.5 py-0.5 rounded text-[var(--text-secondary)]">
                    {s.replace('https://www.googleapis.com/auth/', '')}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <a
          href="/api/gmail/oauth/start"
          className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white text-xs font-semibold rounded-lg hover:bg-[var(--accent-hover)] transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {connected ? 'Yeniden Bağla' : 'Gmail Bağla'}
        </a>
        {connected && (
          <button
            onClick={handleRevoke}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 border border-[var(--danger)]/40 text-[var(--danger)] text-xs font-semibold rounded-lg hover:border-[var(--danger)] transition-all disabled:opacity-50"
          >
            <Unlink className="w-3.5 h-3.5" />
            {busy ? 'Kaldırılıyor…' : 'Bağlantıyı Kaldır'}
          </button>
        )}
      </div>

      <p className="text-[10px] text-[var(--text-muted)]">
        Token değerleri asla gösterilmez; refresh token Supabase Vault&apos;ta at-rest şifreli tutulur.
        Gönderim yalnız mesaj-başı HITL onayıyla ve gerçek pilot için ayrı bayrak açıldığında yapılır.
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="text-[var(--text-primary)] font-medium truncate">{value}</span>
    </div>
  )
}

function StatusRow({
  label, ok, okText, noText, neutral,
}: { label: string; ok: boolean; okText: string; noText: string; neutral?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-[var(--text-secondary)] flex items-center gap-1.5">
        {ok ? <ShieldCheck className="w-3 h-3 text-[var(--success)]" /> : <ShieldAlert className="w-3 h-3 text-[var(--warning)]" />}
        {label}
      </span>
      {ok ? (
        <Badge variant="success">{okText}</Badge>
      ) : (
        <Badge variant={neutral ? 'muted' : 'danger'}>{noText}</Badge>
      )}
    </div>
  )
}
