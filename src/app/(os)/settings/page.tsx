"use client"

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Shield, Server, Activity, Save, AlertTriangle, Package, Trash2, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { fetchSettings, saveSetting } from '@/lib/repositories/settings'

interface ConfigHealth {
  success: boolean
  healthy: boolean
  missingRequired: string[]
  checks: Array<{ key: string; label: string; configured: boolean; required: boolean }>
}

const AGENCY_NAME_KEY = 'agency_name'
const AGENCY_EMAIL_KEY = 'agency_email'
const DEFAULT_AGENCY_NAME = 'GrafikCem Studio'
const DEFAULT_AGENCY_EMAIL = 'info@grafikcem.com'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [seedLoading, setSeedLoading] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // User edits override persisted values; until edited, render persisted/defaults.
  const [agencyNameInput, setAgencyNameInput] = useState<string | null>(null)
  const [agencyEmailInput, setAgencyEmailInput] = useState<string | null>(null)
  const [savingAgency, setSavingAgency] = useState(false)

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  })

  // Live config health — real configured/missing status instead of dummy values.
  const { data: configHealth } = useQuery({
    queryKey: ['config-health'],
    queryFn: async (): Promise<ConfigHealth> => {
      const res = await fetch('/api/health/config')
      if (!res.ok) throw new Error('Health check failed')
      return res.json()
    },
    staleTime: 60_000,
  })

  const persistedName = settings?.find((s) => s.key === AGENCY_NAME_KEY)?.value
  const persistedEmail = settings?.find((s) => s.key === AGENCY_EMAIL_KEY)?.value
  const agencyName = agencyNameInput ?? persistedName ?? DEFAULT_AGENCY_NAME
  const agencyEmail = agencyEmailInput ?? persistedEmail ?? DEFAULT_AGENCY_EMAIL

  const showMsg = (text: string, ok: boolean) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 4000)
  }

  const handleSaveAgency = async () => {
    setSavingAgency(true)
    try {
      await saveSetting(AGENCY_NAME_KEY, agencyName.trim())
      await saveSetting(AGENCY_EMAIL_KEY, agencyEmail.trim())
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      setAgencyNameInput(null)
      setAgencyEmailInput(null)
      showMsg('✓ Ajans bilgileri kaydedildi.', true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bilinmeyen hata'
      showMsg(`Kaydetme başarısız: ${message}`, false)
    } finally {
      setSavingAgency(false)
    }
  }

  const handleSeedPlaybooks = async (force = false) => {
    setSeedLoading(true)
    try {
      const res = await fetch('/api/admin/seed-playbooks', { method: force ? 'PUT' : 'POST' })
      const data = await res.json()
      if (data.success) {
        showMsg(`✓ ${data.count} hizmet paketi yüklendi.`, true)
      } else {
        showMsg(data.message || data.error || 'Hata oluştu.', false)
      }
    } catch {
      showMsg('Bağlantı hatası.', false)
    } finally {
      setSeedLoading(false)
    }
  }

  const handleClearLeads = () => {
    showMsg('Toplu silme devre dışı bırakıldı. Manuel silme için Supabase SQL Editor kullanın.', false)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-5 max-w-[800px]">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Sistem Ayarları</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Ajans bilgileri, API anahtarları ve entegrasyonlar</p>
        </div>

        {/* Status message */}
        {msg && (
          <div className={`px-4 py-3 rounded-lg border text-xs font-medium transition-all ${
            msg.ok
              ? 'bg-[var(--accent-muted)] border-[var(--accent)]/30 text-[var(--accent)]'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
            {msg.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Agency info */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
              <Server className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">Ajans Bilgileri</span>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Ajans Adı</label>
                <input
                  type="text"
                  value={agencyName}
                  onChange={(e) => setAgencyNameInput(e.target.value)}
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-sm p-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--border-highlight)] transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">E-posta</label>
                <input
                  type="email"
                  value={agencyEmail}
                  onChange={(e) => setAgencyEmailInput(e.target.value)}
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-sm p-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--border-highlight)] transition-all"
                />
              </div>
              <button
                onClick={handleSaveAgency}
                disabled={savingAgency}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--accent)] text-black text-sm font-semibold rounded-lg hover:bg-[var(--accent-hover)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-3.5 h-3.5" /> {savingAgency ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>

          {/* API keys */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
              <Shield className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">API Güvenliği</span>
            </div>
            <div className="space-y-2.5">
              {!configHealth && (
                <p className="text-[11px] text-[var(--text-muted)] animate-pulse">Yapılandırma durumu kontrol ediliyor...</p>
              )}
              {configHealth?.checks.map(item => (
                <div key={item.key} className="flex justify-between items-center py-1.5 border-b border-[var(--border-subtle)]/50 last:border-0">
                  <div className="min-w-0">
                    <span className="text-xs text-[var(--text-secondary)] block truncate">{item.label}</span>
                    <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">
                      {item.required ? 'Zorunlu' : 'Opsiyonel'}
                    </span>
                  </div>
                  {item.configured ? (
                    <Badge variant="success">Yapılandırıldı</Badge>
                  ) : item.required ? (
                    <Badge variant="danger">Eksik</Badge>
                  ) : (
                    <Badge variant="muted">Kurulmadı</Badge>
                  )}
                </div>
              ))}
              {configHealth && !configHealth.healthy && (
                <p className="text-[10px] text-red-400 pt-1">
                  ⚠ Eksik zorunlu anahtar: {configHealth.missingRequired.join(', ')}
                </p>
              )}
              <p className="text-[10px] text-[var(--text-muted)] pt-1">
                Anahtarlar <code className="text-[var(--text-secondary)]">.env.local</code> üzerinden yönetilmektedir — değerler asla bu ekranda gösterilmez.
              </p>
            </div>
          </div>
        </div>

        {/* Hizmet Paketleri */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
            <Package className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">Hizmet Paketleri</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Hizmetler sayfası boşsa, aşağıdaki buton ile 10 adet varsayılan Türkçe hizmet paketi yükleyin.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => handleSeedPlaybooks(false)}
              disabled={seedLoading}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-black text-xs font-semibold rounded-lg hover:bg-[var(--accent-hover)] transition-all disabled:opacity-50"
            >
              <Package className="w-3.5 h-3.5" />
              {seedLoading ? 'Yükleniyor...' : 'Varsayılan Paketleri Yükle'}
            </button>
            <button
              onClick={() => handleSeedPlaybooks(true)}
              disabled={seedLoading}
              className="flex items-center gap-2 px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs font-semibold rounded-lg hover:border-[var(--border-highlight)] transition-all disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Sıfırla & Yeniden Yükle
            </button>
          </div>
        </div>

        {/* System logs */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
            <Activity className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">Sistem Logları</span>
          </div>
          <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg p-4 font-mono text-[11px] space-y-2 h-36 overflow-y-auto">
            {(configHealth
              ? [
                  ...configHealth.checks
                    .filter(c => c.required)
                    .map(c => ({
                      level: c.configured ? 'OK' : 'WARN',
                      color: c.configured ? 'text-[var(--success)]' : 'text-[var(--warning)]',
                      msg: c.configured ? `${c.label} yapılandırıldı ✓` : `${c.key} .env.local'a eklenmeli.`,
                    })),
                  { level: 'INFO', color: 'text-[var(--accent)]', msg: 'Cron /daily-scan her gün otomatik çalışır.' },
                ]
              : [{ level: 'INFO', color: 'text-[var(--accent)]', msg: 'Yapılandırma durumu yükleniyor...' }]
            ).map((log, i) => (
              <div key={i} className="flex gap-3">
                <span className={`${log.color} shrink-0`}>[{log.level}]</span>
                <span className="text-[var(--text-secondary)]">{log.msg}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-[var(--bg-surface)] border border-red-500/20 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-red-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Tehlikeli Alan</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Tüm Leadleri Sil</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Veritabanındaki tüm lead kayıtlarını kalıcı olarak siler. Geri alınamaz.</p>
            </div>
            <button
              onClick={handleClearLeads}
              className="flex items-center gap-2 px-4 py-2 border border-red-500/40 text-red-400/50 text-xs font-semibold rounded-lg opacity-50 cursor-not-allowed shrink-0 ml-4"
              title="Devre dışı — Supabase SQL Editor kullanın"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Leadleri Temizle
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
