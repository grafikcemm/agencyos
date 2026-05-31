"use client"

import { useState } from 'react'
import { EyeOff, Shield, Server, Activity, Save, AlertTriangle, Package, Trash2, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export default function SettingsPage() {
  const [seedLoading, setSeedLoading] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const showMsg = (text: string, ok: boolean) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 4000)
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
                  defaultValue="GrafikCem Studio"
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-sm p-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--border-highlight)] transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">E-posta</label>
                <input
                  type="email"
                  defaultValue="info@grafikcem.com"
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-sm p-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--border-highlight)] transition-all"
                />
              </div>
              <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--accent)] text-black text-sm font-semibold rounded-lg hover:bg-[var(--accent-hover)] transition-all">
                <Save className="w-3.5 h-3.5" /> Kaydet
              </button>
            </div>
          </div>

          {/* API keys */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
              <Shield className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">API Güvenliği</span>
            </div>
            <form onSubmit={e => e.preventDefault()} className="space-y-4">
              {[
                { label: 'Google Maps API', value: 'AIzaSyA-dummy-key' },
                { label: 'OpenRouter API', value: 'sk-or-dummy-key' },
              ].map(item => (
                <div key={item.label} className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{item.label}</label>
                    <Badge variant="success">Aktif</Badge>
                  </div>
                  <div className="relative">
                    <input
                      type="password"
                      defaultValue={item.value}
                      disabled
                      autoComplete="off"
                      className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-sm p-2.5 text-[var(--text-muted)] outline-none pr-10"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-[var(--text-muted)] pt-1">
                Anahtarlar <code className="text-[var(--text-secondary)]">.env.local</code> üzerinden yönetilmektedir.
              </p>
            </form>
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
            {[
              { level: 'OK', color: 'text-[var(--success)]', msg: 'Supabase bağlantısı: supabaseAdmin (server-only) ✓' },
              { level: 'OK', color: 'text-[var(--success)]', msg: 'Client fetch yönlendirmesi: /api/db/* ✓' },
              { level: 'OK', color: 'text-[var(--success)]', msg: 'OpenRouter API yapılandırıldı.' },
              { level: 'INFO', color: 'text-[var(--accent)]', msg: 'Cron /daily-scan her gün otomatik çalışır.' },
              { level: 'WARN', color: 'text-[var(--warning)]', msg: 'CRON_SECRET .env.local\'a eklenmeli.' },
            ].map((log, i) => (
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
