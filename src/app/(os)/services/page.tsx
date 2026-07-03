"use client"

// Hizmet Kataloğu v2 — kanonik katalog (GET /api/services) üstüne kurulu.
// Tasarım / AI & Otomasyon / Hibrit sekmeleri + aile grupları.
// Panelin dokunabildiği tek şey: fiyat override + aktiflik (PATCH /api/services/[slug]/pricing).
// Yapı (isim/aile/metin) kodda yaşar; burada salt-okunur gösterilir.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Package, Clock, Target, TrendingUp, Wallet, AlertTriangle, ChevronDown, ChevronUp, Copy, Check, Search, Rocket, Loader2, Pencil, X, EyeOff } from 'lucide-react'
import { SECTOR_PROFILES } from '@/lib/sectorPriority'
import type { ResolvedServicePackage, ServiceDomain, ServiceFamily } from '@/lib/types'
import { useDirective } from '@/lib/useDirective'
import { DirectiveResultModal } from '@/components/agentic/DirectiveResultModal'

type DomainTab = 'all' | ServiceDomain

const DOMAIN_LABEL: Record<ServiceDomain, string> = {
  tasarim: 'Tasarım',
  ai_otomasyon: 'AI & Otomasyon',
  hibrit: 'Hibrit',
}

const DOMAIN_COLOR: Record<ServiceDomain, string> = {
  tasarim: '#8b5cf6',
  ai_otomasyon: 'var(--info)',
  hibrit: 'var(--warning)',
}

const DIFFICULTY_LABEL: Record<string, string> = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
}

function formatTL(n: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0)
}

function annualValue(p: ResolvedServicePackage): number {
  return p.setupPriceTl + p.monthlyPriceTl * 12
}

// Ajan motoruna verilen Türkçe operatör direktifi (eski buildOfferDirective'in katalog uyarlaması).
function buildServiceDirective(p: ResolvedServicePackage, sectorNames: string[]): string {
  const sectors = sectorNames.length > 0 ? sectorNames.join(', ') : 'tüm uygun sektörler'
  const monthly = p.monthlyPriceTl > 0 ? `aylık ${p.monthlyPriceTl} TL` : 'tek seferlik'
  return [
    `"${p.name}" hizmetini satışa çıkar.`,
    `Hedef sektörler: ${sectors}.`,
    `Satış vaadi: "${p.salesCopy.promise}".`,
    `Fiyat: kurulum ${p.setupPriceTl} TL, ${monthly}.`,
    'Bu hizmete uygun mevcut leadleri tara, en yüksek potansiyelli olanları seç ve her biri için kişiselleştirilmiş outreach taslağı ile takip planı hazırla.',
  ].join(' ')
}

interface CatalogData {
  families: ServiceFamily[]
  packages: ResolvedServicePackage[]
}

export default function ServicesPage() {
  const [catalog, setCatalog] = useState<CatalogData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<DomainTab>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const directive = useDirective()

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/services')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Katalog yüklenemedi')
      setCatalog(json.data as CatalogData)
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Katalog yüklenemedi')
    }
  }, [])

  useEffect(() => {
    fetchCatalog()
  }, [fetchCatalog])

  const packages = useMemo(() => catalog?.packages ?? [], [catalog])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return packages.filter((p) => {
      if (tab !== 'all' && p.domain !== tab) return false
      if (q) {
        const haystack = `${p.name} ${p.description} ${p.salesCopy.promise} ${p.familyName}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [packages, tab, query])

  // Aile gruplaması: sekme içinde aile başlıkları altında kartlar.
  const grouped = useMemo(() => {
    const groups = new Map<string, ResolvedServicePackage[]>()
    for (const p of filtered) {
      const list = groups.get(p.familyName) ?? []
      list.push(p)
      groups.set(p.familyName, list)
    }
    return [...groups.entries()]
  }, [filtered])

  const summary = useMemo(() => {
    const total = packages.length
    const activeCount = packages.filter((p) => p.active).length
    const totalMonthly = packages.filter((p) => p.active).reduce((s, p) => s + p.monthlyPriceTl, 0)
    const avgAnnual = total > 0 ? packages.reduce((s, p) => s + annualValue(p), 0) / total : 0
    return { total, activeCount, totalMonthly, avgAnnual }
  }, [packages])

  const launchCampaign = (p: ResolvedServicePackage) => {
    const names = p.targetSectors
      .map((sid) => SECTOR_PROFILES.find((s) => s.id === sid)?.displayName)
      .filter((n): n is string => Boolean(n))
    directive.run(buildServiceDirective(p, names), p.name)
  }

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  return (
    <div className="h-full overflow-y-auto p-6 scrollbar-thin">
      <div className="space-y-5 max-w-[1400px]">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)]">Hizmet Kataloğu</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {filtered.length} / {packages.length} hizmet · yapı kodda, panelden yalnız fiyat ve aktiflik düzenlenir
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryStat icon={Package} label="Toplam hizmet" value={String(summary.total)} color="var(--info)" />
          <SummaryStat icon={TrendingUp} label="Aktif" value={String(summary.activeCount)} color="var(--success)" />
          <SummaryStat icon={Wallet} label="Aktif aylık potansiyel" value={formatTL(summary.totalMonthly)} color="var(--warning)" accent />
          <SummaryStat icon={Target} label="Ortalama yıllık" value={formatTL(summary.avgAnnual)} color="#8b5cf6" />
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-3 flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-[var(--bg-base)] p-0.5 rounded-md border border-[var(--border-subtle)]" role="tablist" aria-label="Hizmet alanı">
            <TabChip active={tab === 'all'} onClick={() => setTab('all')}>Tümü</TabChip>
            {(Object.keys(DOMAIN_LABEL) as ServiceDomain[]).map((d) => (
              <TabChip key={d} active={tab === d} onClick={() => setTab(d)} color={DOMAIN_COLOR[d]}>
                {DOMAIN_LABEL[d]}
              </TabChip>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-md px-2 flex-1 min-w-[160px] focus-within:border-[var(--accent)] transition-colors">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hizmet ara…"
              aria-label="Hizmet ara"
              className="bg-transparent text-[11px] py-1.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none w-full"
            />
          </div>
        </div>

        {loadError && (
          <div className="text-center py-8 bg-[var(--bg-surface)] border border-[var(--danger)]/30 rounded-xl">
            <div className="text-sm text-[var(--danger)]">{loadError}</div>
          </div>
        )}

        {!catalog && !loadError && (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Katalog yükleniyor…
          </div>
        )}

        {grouped.map(([familyName, pkgs]) => (
          <section key={familyName} className="space-y-3">
            <div className="flex items-center gap-2 pt-1">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">{familyName}</h2>
              <div className="flex-1 h-px bg-[var(--border-subtle)]" />
              <span className="text-[9px] text-[var(--text-muted)]">{pkgs.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pkgs.map((pkg) => (
                <ServiceCard
                  key={pkg.slug}
                  pkg={pkg}
                  isOpen={expanded === pkg.slug}
                  isEditing={editing === pkg.slug}
                  copied={copiedId === pkg.slug}
                  directiveRunning={directive.running}
                  directiveLabel={directive.label}
                  onToggle={() => setExpanded(expanded === pkg.slug ? null : pkg.slug)}
                  onEdit={() => setEditing(editing === pkg.slug ? null : pkg.slug)}
                  onSaved={() => {
                    setEditing(null)
                    fetchCatalog()
                  }}
                  onLaunch={() => launchCampaign(pkg)}
                  onCopy={() =>
                    copyText(pkg.slug, `${pkg.name}\n\n${pkg.salesCopy.promise}\n\nKurulum: ${formatTL(pkg.setupPriceTl)}\nAylık: ${formatTL(pkg.monthlyPriceTl)}`)
                  }
                />
              ))}
            </div>
          </section>
        ))}

        {catalog && filtered.length === 0 && (
          <div className="text-center py-16 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl">
            <div className="text-sm text-[var(--text-muted)] mb-2">Bu filtreye uygun hizmet yok</div>
            <div className="text-[10px] text-[var(--text-muted)]">Sekme veya aramayı sıfırlamayı dene.</div>
          </div>
        )}
      </div>

      <DirectiveResultModal
        running={directive.running}
        result={directive.result}
        error={directive.error}
        label={directive.label}
        onClose={directive.reset}
      />
    </div>
  )
}

function ServiceCard({
  pkg, isOpen, isEditing, copied, directiveRunning, directiveLabel,
  onToggle, onEdit, onSaved, onLaunch, onCopy,
}: {
  pkg: ResolvedServicePackage
  isOpen: boolean
  isEditing: boolean
  copied: boolean
  directiveRunning: boolean
  directiveLabel: string | null
  onToggle: () => void
  onEdit: () => void
  onSaved: () => void
  onLaunch: () => void
  onCopy: () => void
}) {
  const color = DOMAIN_COLOR[pkg.domain]
  return (
    <div className={`group/card bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 shadow-soft hover:border-[var(--accent)]/40 ${!pkg.active ? 'opacity-60' : ''}`}>
      <div className="p-4 border-b border-[var(--border-subtle)] space-y-2 relative">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity" style={{ background: color }} />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
                {DOMAIN_LABEL[pkg.domain]}
              </span>
              <span className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{pkg.familyName}</span>
              {!pkg.active && (
                <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)] flex items-center gap-1">
                  <EyeOff className="w-2.5 h-2.5" /> Pasif
                </span>
              )}
            </div>
            <h3 className="text-sm font-bold text-[var(--text-primary)] leading-tight">{pkg.name}</h3>
          </div>
          <button
            onClick={onEdit}
            aria-label={`${pkg.name} fiyatını düzenle`}
            className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-elevated)] transition-colors shrink-0"
          >
            {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{pkg.description}</p>
      </div>

      {isEditing ? (
        <PricingEditor pkg={pkg} onSaved={onSaved} />
      ) : (
        <div className="px-4 py-3 grid grid-cols-3 gap-2 bg-[var(--bg-base)]/40">
          <PriceCell label="Kurulum" value={formatTL(pkg.setupPriceTl)} overridden={pkg.setupPriceTl !== pkg.defaultSetupPriceTl} />
          <PriceCell label="Aylık" value={pkg.monthlyPriceTl > 0 ? formatTL(pkg.monthlyPriceTl) : '—'} accent overridden={pkg.monthlyPriceTl !== pkg.defaultMonthlyPriceTl} />
          <PriceCell label="Süre" value={`${pkg.deliveryDays} gün`} />
        </div>
      )}

      <div className="p-4 space-y-2 flex-1">
        <div className="space-y-1">
          <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Satış vaadi</div>
          <div className="text-[11px] text-[var(--text-primary)] font-medium italic">&ldquo;{pkg.salesCopy.promise}&rdquo;</div>
        </div>

        {pkg.targetSectors.length > 0 && (
          <div className="space-y-1 pt-1">
            <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Uygun sektörler</div>
            <div className="flex flex-wrap gap-1">
              {pkg.targetSectors.slice(0, 3).map((sid) => {
                const sec = SECTOR_PROFILES.find((s) => s.id === sid)
                return sec ? (
                  <span key={sid} className="text-[9px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded text-[var(--text-secondary)]">
                    {sec.displayName.split(' / ')[0]}
                  </span>
                ) : null
              })}
              {pkg.targetSectors.length > 3 && (
                <span className="text-[9px] text-[var(--text-muted)]">+{pkg.targetSectors.length - 3}</span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-[var(--text-muted)]" />
            <span className="text-[9px] text-[var(--text-muted)]">Zorluk: <span className="font-bold text-[var(--text-secondary)]">{DIFFICULTY_LABEL[pkg.difficulty]}</span></span>
          </div>
          <span className="text-[10px] font-bold text-[var(--accent)]">{formatTL(annualValue(pkg))} / yıl</span>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]/40 space-y-3">
          <div className="space-y-1">
            <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Teslimat checklist&apos;i</div>
            <ul className="space-y-1">
              {pkg.salesCopy.checklist.map((item, i) => (
                <li key={i} className="text-[10px] text-[var(--text-secondary)] flex items-start gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-[var(--accent)] mt-1.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {pkg.salesCopy.antiPatterns.length > 0 && (
            <div className="space-y-1">
              <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--danger)] flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" />
                Anti-pattern
              </div>
              <ul className="space-y-1">
                {pkg.salesCopy.antiPatterns.map((ap, i) => (
                  <li key={i} className="text-[10px] text-[var(--text-secondary)] italic">— {ap}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={onLaunch}
            disabled={directiveRunning || !pkg.active}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-[var(--cta-bg,#ffffff)] text-[var(--cta-fg,#000000)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-black rounded-full transition-opacity"
          >
            {directiveRunning && directiveLabel === pkg.name
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Ajanlara devrediliyor…</>
              : <><Rocket className="w-3 h-3" /> Ajanlarla kampanya başlat</>}
          </button>

          <button
            onClick={onCopy}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-base)] text-[10px] font-bold text-[var(--text-primary)] rounded-md transition-all"
          >
            {copied ? <><Check className="w-3 h-3" /> Kopyalandı</> : <><Copy className="w-3 h-3" /> Hızlı sunum metnini kopyala</>}
          </button>
        </div>
      )}

      <button
        onClick={onToggle}
        className="w-full py-2 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] border-t border-[var(--border-subtle)] flex items-center justify-center gap-1 transition-colors"
      >
        {isOpen ? <>Kapat <ChevronUp className="w-3 h-3" /></> : <>Detay <ChevronDown className="w-3 h-3" /></>}
      </button>
    </div>
  )
}

// Satır içi fiyat/aktiflik editörü — panelin dokunabildiği TEK yüzey.
function PricingEditor({ pkg, onSaved }: { pkg: ResolvedServicePackage; onSaved: () => void }) {
  const [setup, setSetup] = useState(String(pkg.setupPriceTl))
  const [monthly, setMonthly] = useState(String(pkg.monthlyPriceTl))
  const [active, setActive] = useState(pkg.active)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/services/${pkg.slug}/pricing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setup_price_tl: Math.max(0, parseInt(setup, 10) || 0),
          monthly_price_tl: Math.max(0, parseInt(monthly, 10) || 0),
          active,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Kaydedilemedi')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 py-3 bg-[var(--bg-base)]/60 space-y-2 border-y border-[var(--accent)]/20">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-muted)] block">Kurulum (TL)</span>
          <input
            type="number" min={0} value={setup} onChange={(e) => setSetup(e.target.value)}
            className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-md px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-muted)] block">Aylık (TL)</span>
          <input
            type="number" min={0} value={monthly} onChange={(e) => setMonthly(e.target.value)}
            className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-md px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-[var(--accent)]" />
        <span className="text-[10px] text-[var(--text-secondary)]">Aktif (günlük fırsat eşleşmelerinde kullanılır)</span>
      </label>
      {error && <div className="text-[10px] text-[var(--danger)]">{error}</div>}
      <button
        onClick={save}
        disabled={saving}
        className="w-full py-1.5 bg-[var(--cta-bg,#ffffff)] text-[var(--cta-fg,#000000)] rounded-full text-[10px] font-black disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {saving ? 'Kaydediliyor…' : 'Kaydet'}
      </button>
    </div>
  )
}

function SummaryStat({ icon: Icon, label, value, color, accent }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; value: string; color: string; accent?: boolean }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] truncate">{label}</div>
        <div className={`num text-sm font-black truncate ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</div>
      </div>
    </div>
  )
}

function PriceCell({ label, value, accent, overridden }: { label: string; value: string; accent?: boolean; overridden?: boolean }) {
  return (
    <div className="text-center">
      <div className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
        {label}{overridden && <span title="Panelden düzenlendi" className="ml-0.5 text-[var(--accent)]">•</span>}
      </div>
      <div className={`num text-[11px] font-black mt-0.5 ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</div>
    </div>
  )
}

function TabChip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-2.5 py-1 text-[9px] font-bold rounded transition-all ${
        active
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
      }`}
      style={active && color ? { color } : undefined}
    >
      {children}
    </button>
  )
}
