"use client"

import dynamic from 'next/dynamic'
import { gateWaPrefill, buildWaHref } from '@/lib/outreach/waPrefill'
import { useState, useEffect, useCallback } from 'react'
import { JarvisPanel } from '@/components/map/JarvisPanel'
import { LeadDrawer } from '@/components/map/LeadDrawer'
import { PersonLeadDrawer } from '@/components/map/PersonLeadDrawer'
import { PersonLeadTable } from '@/components/map/PersonLeadTable'
import { DailyOpportunitiesPanel } from '@/components/leads/DailyOpportunitiesPanel'
import { Search, Loader2, MapPin, Globe, Phone, Filter, ChevronDown, MessageCircle, Eye, Bot, X, Crosshair, Download, Plus, Trash2, SlidersHorizontal, Building2, Users, RefreshCw } from 'lucide-react'
import { Lead } from '@/lib/types'
import { enrichLeads, EnrichedLead } from '@/lib/enrichLead'
import { matchesCity, citySlugify } from '@/lib/geo'
import { TR_PROVINCES, districtsOf } from '@/lib/trGeo'
import { LEAD_COLUMNS, DEFAULT_VISIBLE, COLUMN_STORAGE_KEY } from '@/lib/leadColumns'
import type { LeadColumnKey } from '@/lib/leadColumns'
import type { PersonLead } from '@/lib/personLeads/types'
import { fetchSettings, saveSetting } from '@/lib/repositories/settings'
import type { CircleArea } from '@/components/map/LeadMap'
import { MARKET_SCOPES, sendableCountryCount, workspaceFor, type MarketScope } from '@/lib/leads/marketScope'
import { MarketScopeBar } from '@/components/map/MarketScopeBar'
import { NICHES } from '@/data/niches'

const LeadMap = dynamic(() => import('@/components/map/LeadMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[var(--bg-base)] relative overflow-hidden">
      {/* Skeleton loader */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-surface)] via-[var(--bg-base)] to-[var(--bg-surface)] animate-pulse" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          <span className="text-[10px] text-[var(--text-muted)] tracking-widest uppercase font-medium">Harita yükleniyor</span>
        </div>
        {/* Fake map grid lines */}
        <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 gap-px opacity-5">
          {Array.from({ length: 24 }).map((_, i) => <div key={i} className="bg-[var(--border-subtle)]" />)}
        </div>
      </div>
    </div>
  )
})

// BİRİNCİL ŞERİT ÜÇ KANONİK NİŞTİR (9 Ağustos 2026 kararı). Eski yerel sektör
// listesi SİLİNMEDİ — varsayılan olmaktan çıkarıldı ve "Yerel tipler" katlanır
// bölümüne indi. Kullanıcının kendi kaydettiği tipler korunur.
// Kaynak: src/data/niches.ts · docs/NICHE-DECISION-2026-08-10.md
const NICHE_CHIPS = NICHES.map((n) => ({
  id: n.id,
  label: n.name.split(/[,+]/)[0].trim(),
  query: n.icp.mustHave[0] ?? n.name,
  share: n.outboundShare,
}))

const LEGACY_LOCAL_SECTORS = ['Dişçi', 'Estetik', 'Emlak', 'Oto Servis', 'Spor', 'Güzellik', 'Kuaför', 'Restoran', 'Kafe', 'Butik', 'Nail Art']
const SECTORS = ['Tümü', ...LEGACY_LOCAL_SECTORS]

const SECTOR_QUERY_MAP: Record<string, string> = {
  'Dişçi': 'diş kliniği',
  'Estetik': 'medikal estetik merkezi',
  'Emlak': 'emlak ofisi',
  'Oto Servis': 'oto servis',
  'Spor': 'spor salonu',
  'Güzellik': 'güzellik salonu',
  'Kuaför': 'kuaför',
  'Restoran': 'restoran',
  'Kafe': 'kafe',
  'Butik': 'butik mağaza',
  'Nail Art': 'nail art studio',
}
const SAVED_TYPES_KEY = 'saved_business_types'
const RADIUS_MIN = 250
const RADIUS_MAX = 10000
const DEFAULT_RADIUS = 1500
const LIMIT_MIN = 5
const LIMIT_MAX = 60
const DEFAULT_LIMIT = 15
const MAX_SAVED_TYPES = 40
const GLOBAL_COUNTRIES = [
  { code: 'US', label: 'ABD', defaultLocation: 'New York' },
  { code: 'GB', label: 'Birleşik Krallık', defaultLocation: 'London' },
] as const

const STATUS_FILTERS = [
  { key: 'new', label: 'YENİ', color: 'var(--info)' },
  { key: 'contacted', label: 'İLETİŞİM', color: 'var(--warning)' },
  { key: 'converted', label: 'KAZANILDI', color: 'var(--success)' },
  { key: 'lost', label: 'KAYIP', color: 'var(--danger)' },
]

function formatTL(n: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0)
}
// Türk telefonunu wa.me formatına çevirir ("0534 887 14 35" -> "905348871435").
function normalizeTrPhone(phone: string): string {
  const d = (phone || '').replace(/\D/g, '')
  if (d.startsWith('90')) return d
  if (d.startsWith('0')) return '90' + d.slice(1)
  if (d.length === 10) return '90' + d
  return d
}

function getQualityBadge(lead: Lead) {
  const label = lead.quality_label as string | null
  const tier = lead.lead_tier as string | null
  const score = lead.quality_score ?? lead.potential_score ?? 0

  if (tier === 'A') {
    return { label: 'ÇOK GÜÇLÜ / BUGÜN ARA', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }
  }
  if (tier === 'B') {
    return { label: 'TAKİP / MİNİ AUDİT GÖNDER', color: 'bg-green-500/10 text-green-400 border-green-500/20' }
  }
  if (tier === 'C') {
    return { label: 'ISIT', color: 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20' }
  }
  if (tier === 'D') {
    return { label: 'ELE', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' }
  }

  // Fallback
  if (label === 'Nokta Atışı' || score >= 85) return { label: 'ÇOK GÜÇLÜ / BUGÜN ARA', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }
  if (label === 'Çok Güçlü' || score >= 70) return { label: 'ÇOK GÜÇLÜ / BUGÜN ARA', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }
  if (label === 'Takip Edilebilir' || score >= 55) return { label: 'TAKİP / MİNİ AUDİT GÖNDER', color: 'bg-green-500/10 text-green-400 border-green-500/20' }
  if (label === 'Zayıf' || score >= 40) return { label: 'ISIT', color: 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20' }
  return { label: 'ELE', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' }
}

// CSV hücre değeri — kolon anahtarına göre düz metin (export için).
function csvCellValue(key: LeadColumnKey, lead: EnrichedLead, monthlyVal: number): string {
  switch (key) {
    case 'priority': return getQualityBadge(lead).label
    case 'business_name': return lead.business_name ?? ''
    case 'sector': return lead.sector ?? ''
    case 'location': return `${lead.city ?? ''}${lead.district ? ' / ' + lead.district : ''}`
    case 'phone': return lead.phone ?? ''
    case 'website': return lead.website ?? ''
    case 'email': return lead.email ?? ''
    case 'rating': return lead.rating != null ? String(lead.rating) : ''
    case 'score': return String(lead.quality_score || lead.potential_score || 0)
    case 'service': return lead.recommended_offers?.[0]?.offerName ?? ''
    case 'tier': return lead.lead_tier ?? ''
    case 'value': return monthlyVal > 0 ? String(monthlyVal) : ''
    default: return ''
  }
}

export function HaritaClient({
  initialSurface = 'accounts',
  initialMarketScope = 'tr',
}: {
  initialSurface?: 'accounts' | 'opportunities'
  initialMarketScope?: MarketScope
}) {
  const [surface, setSurface] = useState<'accounts' | 'opportunities'>(initialSurface)
  // ÇALIŞMA ALANI — Türkiye / Global. İki ayrı ürün değil, tek motorun iki alanı.
  // Kullanıcı bir bakışta hangi pazarda olduğunu görür; TR haritası Global
  // yüzeye taşmaz. Bkz. src/lib/leads/marketScope.ts
  const [marketScope, setMarketScope] = useState<MarketScope>(initialMarketScope)
  const [allLeads, setAllLeads] = useState<EnrichedLead[]>([])
  const [filteredLeads, setFilteredLeads] = useState<EnrichedLead[]>([])
  const workspace = workspaceFor(marketScope)
  const [stats, setStats] = useState({ total: 0, yeni: 0, iletisim: 0, kazanildi: 0, yuksek: 0 })

  // Filters
  const [sector, setSector] = useState('')
  const [savedTypes, setSavedTypes] = useState<string[]>([])
  const [city, setCity] = useState('İstanbul')
  const [globalCountryCode, setGlobalCountryCode] = useState<'US' | 'GB'>('US')
  const [globalLocation, setGlobalLocation] = useState('New York')
  const [districts, setDistricts] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>(['new', 'contacted', 'converted', 'lost'])
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100])
  const [showFilters, setShowFilters] = useState(false)

  // Quick Toggles
  const [onlyHot, setOnlyHot] = useState(false)
  const [onlyAds, setOnlyAds] = useState(false)
  const [onlyWebsite, setOnlyWebsite] = useState(false)
  const [onlyWhatsapp, setOnlyWhatsapp] = useState(false)
  const [onlyFollowUp, setOnlyFollowUp] = useState(false)

  // Scan
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState('')
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; district: string } | null>(null)
  const [scanLimit, setScanLimit] = useState(DEFAULT_LIMIT)

  // Daire alan aracı
  const [drawMode, setDrawMode] = useState(false)
  const [circle, setCircle] = useState<CircleArea | null>(null)
  const [radius, setRadius] = useState(DEFAULT_RADIUS)

  // Kolon görünürlüğü
  const [visibleCols, setVisibleCols] = useState<LeadColumnKey[]>(DEFAULT_VISIBLE)
  const [showColMenu, setShowColMenu] = useState(false)

  // Drawer
  const [selectedLead, setSelectedLead] = useState<EnrichedLead | null>(null)
  // 2.4: /bugun "Detay →" derin linki (?lead=<id>) doğru drawer'ı açar — bir kez.
  const [deepLinkApplied, setDeepLinkApplied] = useState(false)

  // Görünüm: işletme leadleri vs kişi/pozisyon leadleri
  const [view, setView] = useState<'businesses' | 'people'>('businesses')
  const [personLeads, setPersonLeads] = useState<PersonLead[]>([])
  const [selectedPerson, setSelectedPerson] = useState<PersonLead | null>(null)
  const [personScanning, setPersonScanning] = useState(false)
  const [personMessage, setPersonMessage] = useState('')

  // Mobile JARVIS overlay
  const [jarvisOpen, setJarvisOpen] = useState(false)

  const fetchLeads = useCallback(async (signal?: AbortSignal) => {
    try {
      // Arşivlenmiş leadleri server-side hariç tut (neStatus) + bounded fetch (limit).
      const res = await fetch('/api/db/leads?order=quality_score&neStatus=archived&limit=1000', { signal })
      const json = await res.json()
      const data = Array.isArray(json) ? json : (json.data ?? [])
      const enriched = enrichLeads(data as Lead[])
      setAllLeads(enriched)
    } catch {
      // Navigasyon/unmount kaynaklı iptal gürültü değildir (body-stream cancel
      // hata adı 'AbortError' olmayabilir) — signal.aborted deterministik işaret.
      if (signal?.aborted) return
      console.error('Lead fetch error')
    }
  }, [])

  const fetchPersonLeads = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/db/person_leads?order=person_score&neStatus=dismissed&limit=1000', { signal })
      const json = await res.json()
      const data = Array.isArray(json) ? json : (json.data ?? [])
      setPersonLeads(data as PersonLead[])
    } catch {
      if (signal?.aborted) return
      console.error('Person lead fetch error')
    }
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    // async fetch sonrası setState (mount'ta veri yükleme) — kasıtlı.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLeads(ctrl.signal); fetchPersonLeads(ctrl.signal)
    return () => ctrl.abort()
  }, [fetchLeads, fetchPersonLeads])

  // Kişi taramasını manuel tetikle (Apollo People Search).
  const handlePersonScan = async () => {
    if (personScanning) return
    setPersonScanning(true)
    setPersonMessage('')
    try {
      const res = await fetch('/api/person-leads/scan', { method: 'POST' })
      const data = await res.json()
      if (data.skipped) setPersonMessage(data.message ?? 'Atlandı.')
      else if (data.success) setPersonMessage(`${data.inserted ?? 0} yeni kişi${data.rateLimited ? ' (kredi limiti)' : ''}.`)
      else setPersonMessage(data.error ?? 'Tarama başarısız.')
      await fetchPersonLeads()
    } catch {
      setPersonMessage('Tarama hatası.')
    } finally {
      setPersonScanning(false)
    }
  }

  // 2.4: leadler yüklenince ?lead=<id> hedefini drawer'da aç (tek sefer).
  useEffect(() => {
    if (deepLinkApplied || allLeads.length === 0) return
    const target = new URLSearchParams(window.location.search).get('lead')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeepLinkApplied(true)
    if (!target) return
    const hit = allLeads.find((l) => l.id === target)
    if (hit) setSelectedLead(hit)
  }, [allLeads, deepLinkApplied])

  // Kayıtlı işletme tipleri (settings JSON) — mount'ta yükle.
  useEffect(() => {
    let active = true
    fetchSettings()
      .then(settings => {
        if (!active) return
        const row = settings.find(s => s.key === SAVED_TYPES_KEY)
        if (!row?.value) return
        try {
          const arr: unknown = JSON.parse(row.value)
          if (Array.isArray(arr)) setSavedTypes(arr.filter((x: unknown): x is string => typeof x === 'string'))
        } catch { /* yok say */ }
      })
      .catch(() => { /* yok say */ })
    return () => { active = false }
  }, [])

  // Kolon görünürlük tercihi (localStorage) — mount'ta yükle.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLUMN_STORAGE_KEY)
      if (!stored) return
      const arr: unknown = JSON.parse(stored)
      if (Array.isArray(arr) && arr.length > 0) {
        const valid = LEAD_COLUMNS.map(c => c.key)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setVisibleCols(arr.filter((x: unknown): x is LeadColumnKey => typeof x === 'string' && valid.includes(x as LeadColumnKey)))
      }
    } catch { /* yok say */ }
  }, [])

  // Apply filters
  useEffect(() => {
    let result = allLeads

    // ÇALIŞMA ALANI FİLTRESİ — her şeyden önce. Eski kayıtlar `market_scope`
    // taşımaz (migration 072 öncesi); onlar Türkiye alanına aittir.
    result = result.filter((l) => {
      const scope = (l as unknown as { market_scope?: string | null }).market_scope
      return (scope ?? 'tr') === marketScope
    })

    // Sector filter
    const activeSector = sector.trim()
    if (activeSector && activeSector !== 'Tümü') {
      const sectorQuery = SECTOR_QUERY_MAP[activeSector] ?? activeSector
      result = result.filter(l => {
        const sLower = l.sector?.toLowerCase() || '';
        return sLower.includes(sectorQuery.toLowerCase()) || sLower.includes(activeSector.toLowerCase());
      })
    }

    // City/district filtresi YALNIZ Türkiye alanında. Global'de il/ilçe modeli
    // yoktur; TR şehir varsayımını dünya geneline uygulamak sonuçları siler.
    if (marketScope === 'tr') {
      result = result.filter(l =>
        matchesCity(l.city_slug, city) ||
        citySlugify(l.city ?? '') === citySlugify(city)
      )
      if (districts.length > 0 && !districts.includes('Tümü')) {
        result = result.filter(l => l.district && districts.includes(l.district))
      }
    }

    // Status filter
    result = result.filter(l => statusFilter.includes(l.status))

    // Score range filter
    result = result.filter(l => (l.potential_score || 0) >= scoreRange[0] && (l.potential_score || 0) <= scoreRange[1])

    // Quick filters
    if (onlyHot) {
      result = result.filter(l => (l.potential_score || 0) >= 80)
    }
    if (onlyAds) {
      result = result.filter(l => l.has_ads_signal)
    }
    if (onlyWebsite) {
      result = result.filter(l => l.has_website)
    }
    if (onlyWhatsapp) {
      result = result.filter(l => l.has_whatsapp)
    }
    if (onlyFollowUp) {
      result = result.filter(l => l.next_follow_up_at !== null && l.next_follow_up_at !== undefined)
    }

    // Sort: disqualified to bottom, then by quality_score desc
    result.sort((a, b) => {
      const aDisq = !!a.disqualification_reason
      const bDisq = !!b.disqualification_reason
      if (aDisq !== bDisq) return aDisq ? 1 : -1
      return (b.quality_score || b.potential_score || 0) - (a.quality_score || a.potential_score || 0)
    })

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilteredLeads(result)
    setStats({
      total: result.length,
      yeni: result.filter(l => l.status === 'new').length,
      iletisim: result.filter(l => l.status === 'contacted').length,
      kazanildi: result.filter(l => l.status === 'converted' || l.status === 'won').length,
      yuksek: result.filter(l => l.priority === 'high' || (l.potential_score || 0) >= 80).length,
    })
  }, [allLeads, marketScope, sector, city, districts, statusFilter, scoreRange, onlyHot, onlyAds, onlyWebsite, onlyWhatsapp, onlyFollowUp])

  const handleScan = async () => {
    if (scanning) return
    setScanning(true)
    setScanMessage('')
    setScanProgress(null)
    // Serbest metin doğrudan Places sorgusu olur; preset etiketi SECTOR_QUERY_MAP ile çevrilir.
    const raw = sector.trim()
    const sectorQuery = raw && raw !== 'Tümü' ? (SECTOR_QUERY_MAP[raw] ?? raw) : 'diş kliniği'

    let totalInserted = 0
    let totalUpdated = 0

    try {
      if (marketScope === 'global') {
        const location = globalLocation.trim()
        if (!location) {
          setScanMessage('Global tarama için şehir veya bölge yazın.')
          return
        }
        setScanProgress({ current: 1, total: 1, district: `${location} · ${globalCountryCode}` })
        const res = await fetch('/api/leads/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sector: sectorQuery,
            city: location,
            district: '',
            limit: scanLimit,
            marketScope,
            countryCode: globalCountryCode,
          }),
        })
        const data = await res.json()
        if (data.success) {
          totalInserted += (data.insertedCount ?? data.count ?? 0)
          totalUpdated += (data.updatedCount ?? 0)
        } else {
          setScanMessage(data.message ?? data.error ?? 'Global tarama başarısız.')
        }
      } else if (circle) {
        // Daire alan: tek tarama (ilçe döngüsü yok), lat/lng/radius gönderilir.
        setScanProgress({ current: 1, total: 1, district: 'Seçili alan' })
        const res = await fetch('/api/leads/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sector: sectorQuery, city, district: '', lat: circle.lat, lng: circle.lng, radius: circle.radius, limit: scanLimit, marketScope: 'tr', countryCode: 'TR' })
        })
        const data = await res.json()
        if (data.success) {
          totalInserted += (data.insertedCount ?? data.count ?? 0)
          totalUpdated += (data.updatedCount ?? 0)
        }
      } else {
        const targetDistricts = (districts.length > 0 && !districts.includes('Tümü')) ? districts : [city]
        for (let i = 0; i < targetDistricts.length; i++) {
          const dist = targetDistricts[i]
          setScanProgress({ current: i + 1, total: targetDistricts.length, district: dist })
          try {
            const res = await fetch('/api/leads/scan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sector: sectorQuery, city, district: dist === city ? '' : dist, limit: scanLimit, marketScope: 'tr', countryCode: 'TR' })
            })
            const data = await res.json()
            if (data.success) {
              totalInserted += (data.insertedCount ?? data.count ?? 0)
              totalUpdated += (data.updatedCount ?? 0)
            }
          } catch {
            // Sonraki ilçe ile devam et
          }
        }
      }
    } finally {
      setScanMessage((current) => current || `${totalInserted} yeni lead, ${totalUpdated} güncelleme.`)
      setScanProgress(null)
      setScanning(false)
      if (totalInserted + totalUpdated > 0) await fetchLeads()
    }
  }

  const toggleStatus = (key: string) => {
    setStatusFilter(prev =>
      prev.includes(key)
        ? prev.filter(s => s !== key)
        : [...prev, key]
    )
  }

  const toggleDistrict = (d: string) => {
    if (d === 'Tümü') {
      setDistricts([])
      return
    }
    setDistricts(prev =>
      prev.includes(d)
        ? prev.filter(x => x !== d)
        : [...prev.filter(x => x !== 'Tümü'), d]
    )
  }

  const availableDistricts = ['Tümü', ...districtsOf(city)]
  const visibleColumnDefs = LEAD_COLUMNS.filter(c => visibleCols.includes(c.key))

  const toggleCol = (key: LeadColumnKey) => {
    setVisibleCols(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      try { localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(next)) } catch { /* yok say */ }
      return next
    })
  }

  const saveSectorType = async () => {
    const raw = sector.trim()
    if (!raw || raw === 'Tümü' || savedTypes.includes(raw)) return
    const next = Array.from(new Set([...savedTypes, raw])).slice(0, MAX_SAVED_TYPES)
    setSavedTypes(next)
    try { await saveSetting(SAVED_TYPES_KEY, JSON.stringify(next)) } catch { /* yok say */ }
  }

  const removeSectorType = async (t: string) => {
    const next = savedTypes.filter(x => x !== t)
    setSavedTypes(next)
    try { await saveSetting(SAVED_TYPES_KEY, JSON.stringify(next)) } catch { /* yok say */ }
  }

  const exportCsv = () => {
    const cols = visibleColumnDefs.filter(c => c.key !== 'actions')
    if (cols.length === 0 || filteredLeads.length === 0) return
    // Formül enjeksiyonunu etkisizleştir: =,+,-,@,tab,CR ile başlayan hücreye ' ön eki.
    const esc = (v: string) => {
      const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
      return `"${safe.replace(/"/g, '""')}"`
    }
    const rows = [cols.map(c => esc(c.label)).join(',')]
    for (const lead of filteredLeads) {
      const monthlyVal = lead.estimated_monthly_value || 0
      rows.push(cols.map(c => esc(csvCellValue(c.key, lead, monthlyVal))).join(','))
    }
    const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leadler-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const syncRadarUrl = (nextSurface: 'accounts' | 'opportunities', nextScope: MarketScope) => {
    const params = new URLSearchParams()
    if (nextSurface === 'opportunities') params.set('surface', 'opportunities')
    if (nextScope === 'global') params.set('market', 'global')
    const query = params.toString()
    window.history.replaceState(null, '', query ? `/harita?${query}` : '/harita')
  }

  const renderCell = (key: LeadColumnKey, lead: EnrichedLead, badge: { label: string; color: string }, monthlyVal: number) => {
    switch (key) {
      case 'priority':
        return (
          <td key={key} className="px-4 py-3 whitespace-nowrap">
            <span className={`text-[9px] font-bold tracking-widest px-2 py-0.5 rounded-full border ${badge.color}`}>{badge.label}</span>
          </td>
        )
      case 'business_name':
        return (
          <td key={key} className="px-4 py-3 font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors whitespace-nowrap truncate max-w-[160px]">{lead.business_name}</td>
        )
      case 'sector':
        return <td key={key} className="px-4 py-3 text-[var(--text-secondary)] whitespace-nowrap truncate max-w-[100px]">{lead.sector}</td>
      case 'location':
        return <td key={key} className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap truncate max-w-[120px]">{lead.city}{lead.district ? ` / ${lead.district}` : ''}</td>
      case 'phone':
        return <td key={key} className="px-4 py-3 num text-[var(--text-secondary)] whitespace-nowrap">{lead.phone || '-'}</td>
      case 'website':
        return <td key={key} className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap truncate max-w-[140px]" title={lead.website || ''}>{lead.website ? lead.website.replace(/^https?:\/\/(www\.)?/, '') : '-'}</td>
      case 'email':
        return <td key={key} className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap truncate max-w-[160px]" title={lead.email || ''}>{lead.email || '-'}</td>
      case 'rating':
        return <td key={key} className="px-4 py-3 text-right num text-[var(--text-secondary)] whitespace-nowrap">{lead.rating != null ? lead.rating : '-'}</td>
      case 'score':
        return <td key={key} className="px-4 py-3 text-right num font-bold text-[var(--accent)] whitespace-nowrap">{lead.quality_score || lead.potential_score || 0}</td>
      case 'service': {
        const offer = lead.recommended_offers?.[0]
        return <td key={key} className="px-4 py-3 text-[var(--text-secondary)] whitespace-nowrap truncate max-w-[180px]" title={offer?.offerName}>{offer ? offer.offerName : '-'}</td>
      }
      case 'tier':
        return (
          <td key={key} className="px-4 py-3 text-center whitespace-nowrap">
            {lead.lead_tier ? <span className="text-[10px] font-black text-[var(--text-secondary)]">{lead.lead_tier}</span> : <span className="text-[var(--text-muted)]">-</span>}
          </td>
        )
      case 'value':
        return <td key={key} className="px-4 py-3 text-right num font-bold text-[var(--text-primary)] whitespace-nowrap">{monthlyVal > 0 ? `${formatTL(monthlyVal)}/ay` : '-'}</td>
      case 'source':
        return (
          <td key={key} className="px-4 py-3 whitespace-nowrap">
            <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full border border-[var(--border-subtle)] text-[var(--text-muted)]">
              <MapPin className="w-2.5 h-2.5" /> Google Maps
            </span>
          </td>
        )
      case 'actions':
        return (
          <td key={key} className="px-4 py-3 whitespace-nowrap" title={lead.next_action}>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid={`lead-detail-${lead.id}`}
                aria-label={`${lead.business_name} detayını aç`}
                onClick={(e) => { e.stopPropagation(); setSelectedLead(lead) }}
                className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  data-testid={`lead-call-${lead.id}`}
                  aria-label={`${lead.business_name} işletmesini ara`}
                  onClick={(e) => e.stopPropagation()}
                  className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-blue-400 hover:border-blue-400/50 transition-all"
                >
                  <Phone className="w-3.5 h-3.5" />
                </a>
              )}
              {lead.phone && (
                <a
                  href={buildWaHref(normalizeTrPhone(lead.phone), gateWaPrefill({ firstMessage: lead.first_message, businessName: lead.business_name ?? '' }))}
                  title={gateWaPrefill({ firstMessage: lead.first_message, businessName: lead.business_name ?? '' }).blockedReason ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`lead-whatsapp-${lead.id}`}
                  aria-label={`${lead.business_name} işletmesine WhatsApp mesajı gönder`}
                  onClick={(e) => e.stopPropagation()}
                  className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-green-400 hover:border-green-400/50 transition-all"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </td>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <MarketScopeBar
        scope={marketScope}
        scopes={MARKET_SCOPES}
        workspace={workspace}
        sendable={sendableCountryCount(marketScope)}
        matchCount={filteredLeads.length}
        onChange={(next) => {
          setMarketScope(next)
          syncRadarUrl(surface, next)
          setDistricts([])
          setCircle(null)
          setDrawMode(false)
          setScanMessage('')
        }}
      />
      <div className="flex items-center gap-1 px-4 pt-3 border-b border-[var(--border-subtle)] bg-[var(--bg-base)] shrink-0" role="tablist" aria-label="Lead Radar görünümleri">
        <button
          type="button"
          role="tab"
          aria-selected={surface === 'accounts'}
          onClick={() => {
            setSurface('accounts')
            syncRadarUrl('accounts', marketScope)
          }}
          className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${surface === 'accounts' ? 'border-[var(--accent)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
        >
          Hesaplar ve harita
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={surface === 'opportunities'}
          onClick={() => {
            setSurface('opportunities')
            syncRadarUrl('opportunities', marketScope)
          }}
          className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${surface === 'opportunities' ? 'border-[var(--accent)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
        >
          Bugünün fırsatları
        </button>
      </div>

      {surface === 'opportunities' ? (
        <DailyOpportunitiesPanel embedded />
      ) : (
      <>
      {/* Top scan bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/70 backdrop-blur-md shrink-0 flex-wrap">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={sector}
            onChange={e => setSector(e.target.value)}
            placeholder="İşletme tipi (örn. diş kliniği)"
            className="bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-lg text-xs px-2.5 py-1.5 w-48 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={saveSectorType}
            disabled={!sector.trim() || sector.trim() === 'Tümü' || savedTypes.includes(sector.trim())}
            aria-label="İşletme tipini kaydet"
            title="Tipi kaydet"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {marketScope === 'tr' ? (
          <select
            value={city}
            onChange={e => { setCity(e.target.value); setDistricts([]); setCircle(null); setDrawMode(false) }}
            className="bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-lg text-xs px-2.5 py-1.5 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            {TR_PROVINCES.map(p => <option key={p.slug} value={p.name}>{p.name}</option>)}
          </select>
        ) : (
          <div className="flex items-center gap-1.5">
            <select
              value={globalCountryCode}
              onChange={(e) => {
                const next = e.target.value as 'US' | 'GB'
                setGlobalCountryCode(next)
                setGlobalLocation(GLOBAL_COUNTRIES.find((country) => country.code === next)?.defaultLocation ?? '')
              }}
              aria-label="Global hedef ülke"
              className="bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-lg text-xs px-2.5 py-1.5 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              {GLOBAL_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.label}</option>)}
            </select>
            <input
              value={globalLocation}
              onChange={(e) => setGlobalLocation(e.target.value)}
              placeholder="Şehir veya bölge"
              aria-label="Global şehir veya bölge"
              className="w-40 bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-lg text-xs px-2.5 py-1.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
            />
          </div>
        )}

        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold rounded-lg transition-all disabled:opacity-50"
        >
          {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          {scanning ? 'Tarıyor...' : 'Tara'}
        </button>

        {/* Sonuç sayısı */}
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-[var(--text-muted)] font-bold tracking-wider uppercase whitespace-nowrap">Sonuç</label>
          <input
            type="range" min={LIMIT_MIN} max={LIMIT_MAX} step={5} value={scanLimit}
            onChange={e => setScanLimit(parseInt(e.target.value, 10))}
            className="w-20 accent-[var(--accent)]"
            aria-label="Tarama sonuç sayısı"
          />
          <span className="num text-xs text-[var(--text-secondary)] w-5">{scanLimit}</span>
        </div>

        {/* Alan Çiz — yalnız Türkiye il/ilçe haritasında. */}
        {marketScope === 'tr' && <button
          type="button"
          onClick={() => setDrawMode(d => !d)}
          aria-pressed={drawMode}
          className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-all ${
            drawMode
              ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
              : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <Crosshair className="w-3 h-3" />
          Alan Çiz
        </button>}

        {/* Yarıçap — çizim modu veya seçili daire varken */}
        {marketScope === 'tr' && (drawMode || circle) && (
          <div className="flex items-center gap-1.5">
            <input
              type="range" min={RADIUS_MIN} max={RADIUS_MAX} step={250} value={radius}
              onChange={e => { const r = parseInt(e.target.value, 10); setRadius(r); setCircle(c => c ? { ...c, radius: r } : c) }}
              className="w-24 accent-[var(--accent)]"
              aria-label="Daire yarıçapı"
            />
            <span className="num text-xs text-[var(--text-secondary)] whitespace-nowrap">{(radius / 1000).toFixed(1)} km</span>
            {circle && (
              <button
                type="button"
                onClick={() => { setCircle(null); setDrawMode(false) }}
                aria-label="Alanı temizle"
                title="Alanı temizle"
                className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:border-[var(--danger)] transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-all ${
            showFilters
              ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-muted)]'
              : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <Filter className="w-3 h-3" />
          Filtre
          <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {/* Scan progress */}
        {scanProgress && (
          <span className="text-xs text-[var(--accent)] font-medium animate-pulse">
            {scanProgress.district} taranıyor... {scanProgress.current}/{scanProgress.total}
          </span>
        )}
        {scanMessage && !scanning && (
          <span className="text-xs text-[var(--text-secondary)]">{scanMessage}</span>
        )}

        <div className="ml-auto flex items-center gap-3 text-xs">
          <button onClick={() => setStatusFilter(['new'])} className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all hover:bg-blue-500/10 ${statusFilter.length === 1 && statusFilter[0] === 'new' ? 'bg-blue-500/10 text-blue-400' : 'text-[var(--text-muted)]'}`}>
            <MapPin className="w-3 h-3 text-blue-400" />{stats.yeni} yeni
          </button>
          <button onClick={() => setStatusFilter(['contacted'])} className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all hover:bg-[var(--accent-muted)] ${statusFilter.length === 1 && statusFilter[0] === 'contacted' ? 'bg-[var(--accent-muted)] text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
            <Phone className="w-3 h-3 text-[var(--accent)]" />{stats.iletisim} iletişim
          </button>
          <button onClick={() => setStatusFilter(['converted'])} className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all hover:bg-green-500/10 ${statusFilter.length === 1 && statusFilter[0] === 'converted' ? 'bg-green-500/10 text-green-400' : 'text-[var(--text-muted)]'}`}>
            <Globe className="w-3 h-3 text-green-400" />{stats.kazanildi} kazanıldı
          </button>
          <button onClick={() => setStatusFilter(['new', 'contacted', 'converted', 'lost'])} className={`flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-all hover:bg-[var(--accent-muted)] ${statusFilter.length >= 3 ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`}>
            {allLeads.filter((lead) => ((lead as unknown as { market_scope?: string | null }).market_scope ?? 'tr') === marketScope).length} toplam
          </button>
        </div>
      </div>

      {/* İşletme tipi chip'leri (preset + kayıtlı) */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0 overflow-x-auto">
        <span className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase shrink-0">Nişler:</span>
        {NICHE_CHIPS.map(n => (
          <button
            key={n.id}
            type="button"
            onClick={() => setSector(n.query)}
            title={`Outbound payı %${n.share}`}
            className={`px-2.5 py-1 text-[10px] font-semibold rounded-lg border transition-all shrink-0 ${
              sector === n.query
                ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]'
                : 'border-[var(--border-highlight)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)]'
            }`}
          >
            {n.label} <span className="opacity-60">%{n.share}</span>
          </button>
        ))}
        {marketScope === 'tr' ? (
          <details className="shrink-0">
            <summary className="cursor-pointer list-none px-2.5 py-1 text-[10px] font-medium rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-[var(--bg-elevated)]">
              Yerel tipler ({SECTORS.length - 1})
            </summary>
            <div className="absolute z-20 mt-1 flex max-w-md flex-wrap gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2 shadow-xl">
              {SECTORS.filter(s => s !== 'Tümü').map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSector(s)}
                  className={`px-2.5 py-1 text-[10px] font-medium rounded-lg border transition-all ${
                    sector === s
                      ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-[var(--bg-card)]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </details>
        ) : null}
        {savedTypes.map(t => (
          <span
            key={t}
            className={`flex items-center gap-1 pl-2.5 pr-1 py-1 text-[10px] font-medium rounded-lg border shrink-0 ${
              sector === t
                ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]'
                : 'border-[var(--border-highlight)] text-[var(--text-secondary)] bg-[var(--bg-elevated)]'
            }`}
          >
            <button type="button" onClick={() => setSector(t)} className="hover:text-[var(--accent)]">{t}</button>
            <button type="button" onClick={() => removeSectorType(t)} aria-label={`${t} tipini sil`} className="w-4 h-4 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--danger)]">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        {sector.trim() && (
          <button type="button" onClick={() => setSector('')} className="text-[9px] text-[var(--accent)] hover:text-[var(--accent-hover)] font-bold uppercase tracking-widest ml-auto whitespace-nowrap shrink-0">
            Tipi Temizle
          </button>
        )}
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0 space-y-3 animate-in fade-in slide-in-from-top-1">
          <div className="flex flex-wrap gap-6">
            {/* District Multi-select — Global çalışma alanında ilçe modeli yoktur. */}
            {marketScope === 'tr' ? (
              <div className="space-y-1.5 min-w-[220px]">
                <label className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase">İlçe Seçimi</label>
                <div className="flex flex-wrap gap-1.5 max-w-[500px]">
                  {availableDistricts.map(d => (
                    <button
                      key={d}
                      onClick={() => toggleDistrict(d)}
                      className={`px-2 py-1 text-[10px] font-medium rounded border transition-colors ${
                        (d === 'Tümü' && districts.length === 0) || districts.includes(d)
                          ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]'
                          : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="min-w-[220px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Coğrafya</div>
                <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                  {GLOBAL_COUNTRIES.find((country) => country.code === globalCountryCode)?.label} · {globalLocation || 'bölge bekliyor'}
                </p>
              </div>
            )}

            {/* Status Checkbox */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase">Durum</label>
              <div className="flex gap-2">
                {STATUS_FILTERS.map(sf => (
                  <button
                    key={sf.key}
                    onClick={() => toggleStatus(sf.key)}
                    className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold tracking-wider rounded border transition-all ${
                      statusFilter.includes(sf.key)
                        ? 'border-current'
                        : 'border-[var(--border-subtle)] opacity-40'
                    }`}
                    style={{ color: statusFilter.includes(sf.key) ? sf.color : undefined }}
                  >
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: sf.color, opacity: statusFilter.includes(sf.key) ? 1 : 0.3 }}
                    />
                    {sf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Score Slider */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase">
                Skor Aralığı: {scoreRange[0]} — {scoreRange[1]}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={0} max={100} value={scoreRange[0]}
                  onChange={e => setScoreRange([Math.min(parseInt(e.target.value), scoreRange[1]), scoreRange[1]])}
                  className="w-24 accent-[var(--accent)]"
                />
                <input
                  type="range" min={0} max={100} value={scoreRange[1]}
                  onChange={e => setScoreRange([scoreRange[0], Math.max(parseInt(e.target.value), scoreRange[0])])}
                  className="w-24 accent-[var(--accent)]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Radar Filtreleri (Quick Toggles) */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0 overflow-x-auto">
        <span className="text-[10px] text-[var(--text-muted)] font-bold tracking-widest uppercase shrink-0">Hızlı Radar:</span>
        <button
          onClick={() => setOnlyHot(!onlyHot)}
          className={`px-2.5 py-1 text-[10px] font-bold tracking-wider rounded-lg border transition-all shrink-0 ${
            onlyHot
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-extrabold'
              : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-[var(--bg-elevated)]'
          }`}
        >
          🔥 80+ Sıcak Lead
        </button>
        <button
          onClick={() => setOnlyAds(!onlyAds)}
          className={`px-2.5 py-1 text-[10px] font-bold tracking-wider rounded-lg border transition-all shrink-0 ${
            onlyAds
              ? 'border-[var(--accent)]/40 bg-[var(--accent-muted)] text-[var(--accent)] font-extrabold'
              : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-[var(--bg-elevated)]'
          }`}
        >
          📢 Reklam Sinyali
        </button>
        <button
          onClick={() => setOnlyWebsite(!onlyWebsite)}
          className={`px-2.5 py-1 text-[10px] font-bold tracking-wider rounded-lg border transition-all shrink-0 ${
            onlyWebsite
              ? 'border-blue-500/40 bg-blue-500/10 text-blue-400 font-extrabold'
              : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-[var(--bg-elevated)]'
          }`}
        >
          🌐 Web Sitesi Var
        </button>
        <button
          onClick={() => setOnlyWhatsapp(!onlyWhatsapp)}
          className={`px-2.5 py-1 text-[10px] font-bold tracking-wider rounded-lg border transition-all shrink-0 ${
            onlyWhatsapp
              ? 'border-green-500/40 bg-green-500/10 text-green-400 font-extrabold'
              : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-[var(--bg-elevated)]'
          }`}
        >
          💬 WhatsApp Var
        </button>
        <button
          onClick={() => setOnlyFollowUp(!onlyFollowUp)}
          className={`px-2.5 py-1 text-[10px] font-bold tracking-wider rounded-lg border transition-all shrink-0 ${
            onlyFollowUp
              ? 'border-purple-500/40 bg-purple-500/10 text-purple-400 font-extrabold'
              : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-[var(--bg-elevated)]'
          }`}
        >
          📅 Takip Bekleyen
        </button>

        {/* Clear all filters button if any is active */}
        {(onlyHot || onlyAds || onlyWebsite || onlyWhatsapp || onlyFollowUp) && (
          <button
            onClick={() => {
              setOnlyHot(false)
              setOnlyAds(false)
              setOnlyWebsite(false)
              setOnlyWhatsapp(false)
              setOnlyFollowUp(false)
            }}
            className="text-[9px] text-[var(--accent)] hover:text-[var(--accent-hover)] font-bold uppercase tracking-widest ml-auto whitespace-nowrap"
          >
            Filtreleri Temizle
          </button>
        )}
      </div>

      {/* Map + JARVIS side panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left block split: Map on top (60%), Lead Radar Listesi on bottom (40%) */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div className="flex-1 relative min-h-[300px]">
            <LeadMap
              leads={filteredLeads}
              scope={marketScope}
              onLeadClick={setSelectedLead}
              drawMode={drawMode}
              circle={circle}
              onCircleChange={(c) => { setCircle(c); setRadius(c.radius) }}
            />
          </div>

          {/* Lead Radar Listesi */}
          <div className="h-[260px] border-t border-[var(--border-subtle)] bg-[var(--glass-bg)] backdrop-blur-md flex flex-col overflow-hidden shrink-0">
            <div className="px-4 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0 bg-[var(--bg-elevated)]">
              <div className="flex items-center gap-3">
                {/* Görünüm toggle: İşletmeler / Kişiler */}
                <div className="flex items-center rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setView('businesses')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold tracking-wider transition-all ${view === 'businesses' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                  >
                    <Building2 className="w-3 h-3" /> İşletmeler
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('people')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold tracking-wider transition-all ${view === 'people' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                  >
                    <Users className="w-3 h-3" /> Kişiler
                  </button>
                </div>
                {view === 'businesses' ? (
                  <span className="text-[10px] font-black tracking-widest text-[var(--text-primary)] uppercase">
                    {filteredLeads.filter(l => !l.disqualification_reason).length} uygun
                    {filteredLeads.filter(l => !!l.disqualification_reason).length > 0
                      ? ` · ${filteredLeads.filter(l => !!l.disqualification_reason).length} elenmiş`
                      : ''}
                  </span>
                ) : (
                  <span className="text-[10px] font-black tracking-widest text-[var(--text-primary)] uppercase">
                    {personLeads.length} kişi
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {view === 'people' && (
                  <>
                    <button
                      type="button"
                      onClick={handlePersonScan}
                      disabled={personScanning}
                      className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--border-subtle)] text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all disabled:opacity-40"
                    >
                      {personScanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Kişi Tara
                    </button>
                    {personMessage && <span className="text-[10px] text-[var(--text-secondary)]">{personMessage}</span>}
                  </>
                )}
                {view === 'businesses' && (
                  <>
                    <div className="relative">
                      <button type="button" onClick={() => setShowColMenu(v => !v)} className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--border-subtle)] text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all">
                        <SlidersHorizontal className="w-3 h-3" /> Sütunlar
                      </button>
                      {showColMenu && (
                        <div className="absolute right-0 top-full mt-1 z-20 w-44 max-h-64 overflow-y-auto rounded-lg border border-[var(--border-highlight)] bg-[var(--bg-elevated)] shadow-xl p-1.5 scrollbar-thin">
                          {LEAD_COLUMNS.map(col => (
                            <label key={col.key} className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] hover:bg-[var(--bg-surface)] ${col.alwaysOn ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                              <input type="checkbox" checked={visibleCols.includes(col.key)} disabled={col.alwaysOn} onChange={() => { if (!col.alwaysOn) toggleCol(col.key) }} className="accent-[var(--accent)]" />
                              <span className="text-[var(--text-secondary)]">{col.label}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={exportCsv} disabled={filteredLeads.length === 0} className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--border-subtle)] text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all disabled:opacity-40">
                      <Download className="w-3 h-3" /> CSV
                    </button>
                  </>
                )}
                <span className="hidden md:inline text-[10px] text-[var(--text-muted)]">Seçerek detay açın.</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {view === 'people' ? (
                <PersonLeadTable people={personLeads} onSelect={setSelectedPerson} />
              ) : filteredLeads.length === 0 ? (
                marketScope === 'global' ? (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                    <Globe className="mb-3 h-6 w-6 text-[var(--accent)]" aria-hidden />
                    <p className="text-sm font-bold text-[var(--text-primary)]">Global çalışma alanı yeni ve boş.</p>
                    <p className="mt-2 max-w-md text-[11px] leading-relaxed text-[var(--text-muted)]">
                      Önce bir niş, ABD veya Birleşik Krallık ve şehir seçin. Küçük bir keşif taraması çalıştırın;
                      bulunan hesaplar gönderimden önce ülke politikası, kurumsal e-posta ve insan onayı kapılarından geçer.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                      <span className="rounded-md border border-[var(--border-subtle)] px-2 py-1">1 · Niş</span>
                      <span className="rounded-md border border-[var(--border-subtle)] px-2 py-1">2 · Ülke / şehir</span>
                      <span className="rounded-md border border-[var(--border-subtle)] px-2 py-1">3 · Küçük pilot</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                    <span className="text-xl mb-2">🎯</span>
                    <p className="text-xs font-bold text-[var(--text-secondary)]">Uyumlu lead bulunamadı.</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">Farklı filtreleri deneyebilir veya yukarıdaki &quot;Tara&quot; butonuyla bölge taraması başlatabilirsiniz.</p>
                  </div>
                )
              ) : (
                <>
                {/* Desktop table */}
                <table className="hidden md:table w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-[var(--bg-base)] text-[9px] text-[var(--text-muted)] font-bold tracking-widest uppercase border-b border-[var(--border-subtle)] z-10">
                    <tr>
                      {visibleColumnDefs.map(col => (
                        <th key={col.key} className={`px-4 py-2 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {filteredLeads.map((lead) => {
                      const badge = getQualityBadge(lead)
                      const monthlyVal = lead.estimated_monthly_value || 0
                      return (
                        <tr
                          key={lead.id}
                          data-testid={`lead-row-${lead.id}`}
                          onClick={() => setSelectedLead(lead)}
                          className="hover:bg-[var(--bg-elevated)] cursor-pointer transition-colors group"
                        >
                          {visibleColumnDefs.map(col => renderCell(col.key, lead, badge, monthlyVal))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* Mobile card list */}
                <div className="md:hidden divide-y divide-[var(--border-subtle)]">
                  {filteredLeads.map((lead) => {
                    const badge = getQualityBadge(lead)
                    const monthlyVal = lead.estimated_monthly_value || 0
                    return (
                      <div
                        key={lead.id}
                        data-testid={`lead-card-${lead.id}`}
                        className="p-3 space-y-2 active:bg-[var(--bg-elevated)]"
                        onClick={() => setSelectedLead(lead)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-[var(--text-primary)] truncate">{lead.business_name}</div>
                            <div className="text-[10px] text-[var(--text-muted)] truncate">
                              {lead.sector} · {lead.city}{lead.district ? ` / ${lead.district}` : ''}
                            </div>
                          </div>
                          <span className="text-sm font-black text-[var(--accent)] shrink-0">{lead.quality_score || lead.potential_score || 0}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[8px] font-bold tracking-widest px-2 py-0.5 rounded-full border ${badge.color}`}>
                            {badge.label}
                          </span>
                          {monthlyVal > 0 && (
                            <span className="text-[10px] font-bold text-[var(--text-secondary)]">{formatTL(monthlyVal)}/ay</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            aria-label={`${lead.business_name} detayını aç`}
                            onClick={(e) => { e.stopPropagation(); setSelectedLead(lead) }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-[var(--border-subtle)] text-[11px] font-bold text-[var(--text-secondary)]"
                          >
                            <Eye className="w-3.5 h-3.5" /> Detay
                          </button>
                          {lead.phone && (
                            <a
                              href={`tel:${lead.phone}`}
                              aria-label={`${lead.business_name} işletmesini ara`}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-[11px] font-bold text-blue-400"
                            >
                              <Phone className="w-3.5 h-3.5" /> Ara
                            </a>
                          )}
                          {lead.phone && (
                            <a
                              href={buildWaHref(normalizeTrPhone(lead.phone), gateWaPrefill({ firstMessage: lead.first_message, businessName: lead.business_name ?? '' }))}
                  title={gateWaPrefill({ firstMessage: lead.first_message, businessName: lead.business_name ?? '' }).blockedReason ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${lead.business_name} işletmesine WhatsApp mesajı gönder`}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-[11px] font-bold text-green-400"
                            >
                              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right JARVIS Panel — desktop */}
        <div className="hidden lg:block w-80 shrink-0 border-l border-[var(--border-subtle)] overflow-hidden">
          <JarvisPanel
            key={`${marketScope}:${marketScope === 'global' ? `${globalCountryCode}:${globalLocation}` : city}`}
            leadsCount={allLeads.length}
            stats={{ new: stats.yeni, contacted: stats.iletisim, won: stats.kazanildi }}
            onLeadsChanged={fetchLeads}
            marketScope={marketScope}
            locationLabel={marketScope === 'global' ? `${globalLocation} · ${globalCountryCode}` : city}
          />
        </div>
      </div>

      {/* JARVIS — mobile floating button + fullscreen overlay */}
      <button
        type="button"
        aria-label="JARVIS asistanını aç"
        data-testid="jarvis-mobile-toggle"
        onClick={() => setJarvisOpen(true)}
        className="lg:hidden fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/30 flex items-center justify-center active:scale-95 transition-transform"
      >
        <Bot className="w-5 h-5" />
      </button>
      {jarvisOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-[var(--bg-base)]" role="dialog" aria-modal="true" aria-label="JARVIS asistanı">
          <button
            type="button"
            aria-label="JARVIS panelini kapat"
            onClick={() => setJarvisOpen(false)}
            className="absolute right-3 top-3 z-10 w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]"
          >
            <X className="w-4 h-4" />
          </button>
          <JarvisPanel
            key={`mobile:${marketScope}:${marketScope === 'global' ? `${globalCountryCode}:${globalLocation}` : city}`}
            leadsCount={allLeads.length}
            stats={{ new: stats.yeni, contacted: stats.iletisim, won: stats.kazanildi }}
            onLeadsChanged={fetchLeads}
            marketScope={marketScope}
            locationLabel={marketScope === 'global' ? `${globalLocation} · ${globalCountryCode}` : city}
          />
        </div>
      )}

      {/* Lead Drawer */}
      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}

      {/* Person Lead Drawer */}
      {selectedPerson && (
        <PersonLeadDrawer
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
        />
      )}
      </>
      )}
    </div>
  )
}
