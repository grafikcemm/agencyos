"use client"

import { useState } from 'react'
import { X, Sparkles, Building2, Copy, Trash2, CheckCircle2, Phone, MessageSquare, ShieldAlert, ChevronDown, ChevronUp, Check, Search } from 'lucide-react'
import type { EnrichedLead } from '@/lib/enrichLead'
import { BUDGET_BANDS } from '@/lib/leads/pipelineGate'

// ─── Script generation ───────────────────────────────────────────────────────

function buildScripts(lead: EnrichedLead) {
  const b = lead.business_name
  const sector = lead.sector || 'işletme'
  const city = lead.city || 'bölgeniz'
  const noWeb = !lead.has_website
  const score = lead.quality_score || lead.potential_score || 50
  const rating = lead.rating ? `${lead.rating} yıldız` : 'iyi bir puan'
  const service = noWeb ? 'Logo + Web Sitesi + Sosyal Medya' : 'Sosyal Medya Yönetimi + AI Görsel'
  const value = score >= 80 ? '8.000–15.000₺' : score >= 60 ? '5.000–10.000₺' : '3.000–6.000₺'

  const call = `Merhaba, ${b} ile mi görüşüyorum? İyi günler, ben GrafikCem Studio'dan arıyorum.

${city}'daki ${sector} işletmelerine dijital hizmetler sunuyoruz. ${b} hakkında kısa bir araştırma yaptım.

${noWeb
    ? `Google'da işletmenizi buldum — ${rating} puanınız var, harika! Ancak web siteniz bulunmuyor. Bu, internetten sizi arayan müşterilerin sizi bulamadığı anlamına geliyor.`
    : `Google'da harika bir profiliniz var — ${rating}. Sosyal medya içeriklerinizi güçlendirerek çok daha fazla müşteriye ulaşabilirsiniz.`
}

Size 5 dakika ayırabilir misiniz? ${service} paketi için özel bir teklifimiz var.

━━━━━━━━━━
✅  EVET → "Harika! ${value} değerinde bir paket düşünüyorum, size özel fiyatlandırabiliriz. Ne zaman görüşelim?"
⏰  MEŞGUL → "Hiç sorun değil. Sizi ne zaman arasam uygun olur? Yarın sabah mı, öğleden sonra mı?"
❌  İLGİLENMİYORUM → "Anlıyorum. Yine de kısa bir bilgi paylaşabilir miyim? Sonra karar verirsiniz."`

  const whatsapp = `Merhaba ${b} 👋

${city}'da faaliyet gösteren ${sector} işletmelerine özel dijital çözümler sunuyoruz.

${noWeb
    ? `🔍 Google'da ${rating} puanınız var — harika! Ancak web siteniz bulunmuyor. Bu durum, her ay potansiyel müşterilerin sizi bulamaması anlamına geliyor.`
    : `📊 Google'daki ${rating} puanınızı gördük — tebrikler! Dijital görünürlüğünüzü bir adım öteye taşımak için size özel bir paketimiz var.`
}

🎯 Size özel hazırladıklarımız:
${noWeb
    ? '• Logo & Web Sitesi Tasarımı\n• Instagram Şablon Seti\n• Google İşletmem Optimizasyonu'
    : '• Aylık Sosyal Medya Yönetimi\n• AI Destekli Görsel Üretimi\n• İçerik Stratejisi & Planlama'
}

💰 Tahmini yatırım: ${value}

Görüşmek ister misiniz? 15 dakikalık kısa bir görüşme yeterli 🤝`

  return { call, whatsapp, value, sector, city }
}

const OBJECTIONS = [
  {
    q: '"Fiyat çok yüksek."',
    a: (v: string) => `"Anlıyorum, fiyat her zaman önemli bir kriter. Şunu sorayım: şu an dijital görünürlük eksikliği nedeniyle her ay kaç potansiyel müşteri kaçırıyor olabilirsiniz? Tahminen 20-30 kişi. ${v}'lik bu yatırım, ilk 2 ayda karşılığını çıkarabilir. Üstelik taksit seçeneğimiz de var."`
  },
  {
    q: '"Şu an ilgilenmiyorum."',
    a: () => `"Tamamen anlıyorum, zamanlama önemli. Önümüzdeki ay için bir görüşme planlayabilir miyiz? Bu sürede işletmenize özel ücretsiz bir dijital analiz raporu hazırlayıp gönderebilirim — hiçbir yükümlülük olmadan."`
  },
  {
    q: '"Başka biriyle çalışıyoruz."',
    a: (_v: string, sector: string) => `"Harika, mevcut bir ortağınız var demek. Yarıştırmaya değil, tamamlamaya geliyorum. Özellikle ${sector} sektörüne özel konularda uzmanız. Bu alanda neler yapabileceğimizi göstermek ister misiniz?"`
  },
  {
    q: '"Buna ihtiyacımız yok."',
    a: (_v: string, _s: string, city: string) => `"${city}'da bölgenizdeki rakiplerinizin büyük çoğunluğu artık aktif sosyal medya ve web varlığı kullanıyor. Sadece 15 dakika — rakiplerinizin ne yaptığını birlikte inceleyelim, sonra karar verirsiniz."`
  },
]

// ─── Main component ───────────────────────────────────────────────────────────

export function LeadModal({ lead, onClose, onUpdate }: { lead: EnrichedLead; onClose: () => void; onUpdate: () => void }) {
  const [status, setStatus] = useState(lead.status || 'new')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'overview' | 'scripts'>('overview')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [openObj, setOpenObj] = useState<number | null>(null)
  const [flags, setFlags] = useState<Record<string, boolean>>(lead.behavioral_flags ?? {})
  const [riskScore, setRiskScore] = useState<number>(lead.risk_score ?? 0)
  const [riskSaving, setRiskSaving] = useState(false)
  const [painPoint, setPainPoint] = useState(lead.pain_point ?? '')
  const [decisionMaker, setDecisionMaker] = useState(lead.decision_maker ?? '')
  const [budgetBand, setBudgetBand] = useState(lead.budget_band ?? '')

  const jsonHeaders = { 'Content-Type': 'application/json' }

  // Davranışsal risk bayrağı değişince base_score korunarak yalnız risk yeniden hesaplanır.
  const toggleFlag = async (key: string) => {
    const next = { ...flags, [key]: !flags[key] }
    setFlags(next)
    setRiskSaving(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}/risk`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ behavioral_flags: next }),
      })
      if (res.ok) {
        const data = await res.json()
        if (typeof data.risk_score === 'number') setRiskScore(data.risk_score)
        onUpdate()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setRiskSaving(false)
    }
  }

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleSave = async () => {
    setLoading(true)
    const res = await fetch('/api/db/leads', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({
        id: lead.id,
        status,
        pain_point: painPoint.trim() || null,
        decision_maker: decisionMaker.trim() || null,
        budget_band: budgetBand || null,
      }),
    })
    setLoading(false)
    if (!res.ok) {
      let message = 'Kaydedilemedi.'
      try {
        const data = await res.json()
        if (data?.error) message = data.error
      } catch { /* ignore */ }
      alert(message)
      return
    }
    onUpdate()
    onClose()
  }

  const handleDelete = async () => {
    if (!confirm(`"${lead.business_name}" silinecek. Onaylıyor musunuz?`)) return
    setLoading(true)
    await fetch(`/api/db/leads?id=${lead.id}`, { method: 'DELETE' })
    setLoading(false)
    onUpdate()
    onClose()
  }

  const handleConvertToProject = async () => {
    setLoading(true)
    await fetch('/api/db/projects', {
      method: 'POST', headers: jsonHeaders,
      body: JSON.stringify({ lead_id: lead.id, business_name: lead.business_name, status: 'active', services: ['Yeni Proje'], revenue_tl: 0, revenue_collected: false })
    })
    await fetch('/api/db/leads', { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ id: lead.id, status: 'converted' }) })
    setLoading(false)
    onUpdate()
    onClose()
  }

  const handleAnalyze = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/leads/analyze', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ lead_id: lead.id }) })
      if (res.ok) onUpdate()
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const handleCopySummary = () => {
    const services = lead.sector === 'güzellik salonu' || lead.sector === 'kuaför salonu'
      ? '• Sosyal Medya Şablonu\n• Logo Tasarımı\n• Instagram Yönetimi'
      : lead.sector === 'kafe' || lead.sector === 'kahve dükkanı'
      ? '• AI Görsel Üretimi\n• Sosyal Medya Yönetimi\n• Logo'
      : '• Logo & Kurumsal Kimlik\n• Sosyal Medya Şablonu'
    const estimatedValue = (lead.quality_score || lead.potential_score || 0) >= 80 ? '8.000–15.000₺' : (lead.quality_score || lead.potential_score || 0) >= 60 ? '5.000–10.000₺' : '3.000–6.000₺'
    const text = `🎯 YENİ LEAD — ${lead.priority === 'high' ? '⚡ YÜKSEK ÖNCELİK' : ''}

İşletme: ${lead.business_name}
Sektör: ${lead.sector || 'Belirtilmedi'}
Şehir: ${lead.city || 'Belirtilmedi'}
📞 ${lead.phone || 'Yok'}
⭐ Google: ${lead.rating || '?'}/5 (${lead.review_count || 0} yorum)

❌ Eksikler:
${!lead.has_website ? '• Web sitesi YOK\n' : ''}${(lead.quality_score || lead.potential_score || 0) >= 80 ? '• Dijital görünürlük yetersiz\n' : ''}
💡 Önerilen Hizmetler:
${services}

💰 Tahmini Değer: ${estimatedValue}

📝 Not: ${lead.ai_analysis?.slice(0, 100) || 'Analiz bekleniyor'}`
    copy(text, 'summary')
  }

  const scripts = buildScripts(lead)

  const renderCopyBtn = (label: string, textKey: string, text: string) => (
    <button
      onClick={() => copy(text, textKey)}
      className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
    >
      {copiedKey === textKey ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copiedKey === textKey ? 'Kopyalandı' : label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] w-full max-w-2xl rounded-2xl shadow-2xl relative max-h-[92vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="p-5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-base)]/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-muted)] flex items-center justify-center border border-[var(--accent)]/20">
              <Building2 className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">{lead.business_name}</h2>
              <div className="flex gap-1.5 text-[11px] text-[var(--text-secondary)] mt-0.5">
                <span>{lead.sector || 'Sektör Yok'}</span>
                <span>•</span>
                <span>{lead.city || 'Şehir Yok'}</span>
                {lead.phone && <><span>•</span><span>{lead.phone}</span></>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-base)] rounded-full transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-base)]/30">
          {([
            { key: 'overview', label: 'Özet & Durum' },
            { key: 'scripts', label: 'Konuşma Scriptleri' },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-all ${
                tab === t.key
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Tab: Overview ── */}
          {tab === 'overview' && (
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Left */}
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Durumu Güncelle</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {['new', 'contacted', 'responded', 'meeting', 'proposal', 'converted'].map(s => (
                      <button
                        key={s}
                        onClick={() => setStatus(s)}
                        className={`px-2 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${
                          status === s
                            ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                            : 'bg-[var(--bg-base)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--text-muted)]'
                        }`}
                      >
                        {s.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] p-4 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-[10px] text-[var(--accent)] font-bold uppercase tracking-widest flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" /> AI Analizi
                    </h3>
                    {!lead.ai_analysis && (
                      <button onClick={handleAnalyze} disabled={loading} className="text-[10px] bg-[var(--cta-bg)] text-[var(--cta-fg)] px-2 py-1 rounded-md font-bold hover:bg-[#e6e6e6] transition-all disabled:opacity-50">
                        {loading ? 'Analiz...' : 'Analiz Et'}
                      </button>
                    )}
                  </div>
                  <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed italic">
                    {lead.ai_analysis || 'Henüz analiz yapılmadı.'}
                  </p>
                </div>

                {/* Discovery — 'proposal' aşaması için zorunlu (gatekeeper) */}
                <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] p-4 rounded-xl space-y-3">
                  <h3 className="text-[10px] text-[var(--accent)] font-bold uppercase tracking-widest flex items-center gap-1.5">
                    <Search className="w-3 h-3" /> Discovery (Teklif için zorunlu)
                  </h3>
                  <div className="space-y-1">
                    <label className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Acı Noktası — en kritik problem ne?</label>
                    <input
                      type="text"
                      value={painPoint}
                      onChange={(e) => setPainPoint(e.target.value)}
                      placeholder="Örn: sosyal medya görselleri tutarsız, etkileşim düşük"
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-[12px] p-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Karar Verici — kim onaylıyor?</label>
                    <input
                      type="text"
                      value={decisionMaker}
                      onChange={(e) => setDecisionMaker(e.target.value)}
                      placeholder="Örn: işletme sahibi / pazarlama müdürü"
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-[12px] p-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Bütçe Bandı</label>
                    <div className="grid grid-cols-4 gap-1">
                      {BUDGET_BANDS.map((b) => (
                        <button
                          key={b}
                          onClick={() => setBudgetBand(budgetBand === b ? '' : b)}
                          className={`px-1 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${
                            budgetBand === b
                              ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--text-muted)]'
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Risk bayrakları — base_score korunur, potential = base - risk */}
                <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] p-4 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-[10px] text-[var(--danger)] font-bold uppercase tracking-widest flex items-center gap-1.5">
                      <ShieldAlert className="w-3 h-3" /> Risk Bayrakları
                    </h3>
                    <span className="text-[10px] font-bold text-[var(--text-muted)]">
                      {riskSaving ? '...' : `−${riskScore} risk`}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {([
                      { key: 'free_sample', label: 'Ücretsiz iş/örnek istedi' },
                      { key: 'bargaining', label: 'Sürekli fiyat pazarlığı' },
                      { key: 'payment_term_long', label: 'Uzun ödeme vadesi dayatıyor' },
                      { key: 'scope_creep', label: 'Kapsam belirsiz / scope creep' },
                      { key: 'no_company_record', label: 'Firma kaydı teyit edilemedi' },
                    ] as const).map((f) => (
                      <button
                        key={f.key}
                        onClick={() => toggleFlag(f.key)}
                        disabled={riskSaving}
                        className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border text-left transition-all disabled:opacity-50 ${
                          flags[f.key]
                            ? 'bg-[var(--danger)]/10 border-[var(--danger)]/40 text-[var(--danger)]'
                            : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
                        }`}
                      >
                        <span className={`w-3 h-3 rounded-sm border shrink-0 flex items-center justify-center ${flags[f.key] ? 'bg-[var(--danger)] border-[var(--danger)]' : 'border-[var(--border-subtle)]'}`}>
                          {flags[f.key] && <Check className="w-2.5 h-2.5 text-white" />}
                        </span>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right */}
              <div className="space-y-5">
                <div className="bg-[var(--accent-muted)] border border-[var(--accent)]/20 p-4 rounded-xl flex flex-col">
                  <h3 className="text-[10px] text-[var(--accent)] font-bold uppercase tracking-widest mb-3">Pitch Taslağı</h3>
                  <p className="text-[12px] text-[var(--text-primary)] leading-relaxed flex-1 italic opacity-90 mb-4">
                    {"\""}{lead.first_30_seconds_pitch || lead.first_message || 'Sayın yetkili, dijital varlığınızı güçlendirmek için size özel bir teklifimiz var.'}{"\""}
                  </p>
                  <button
                    onClick={handleCopySummary}
                    className="flex items-center justify-center gap-2 w-full py-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] text-[11px] font-bold rounded-lg transition-all text-[var(--text-secondary)] hover:text-[var(--accent)]"
                  >
                    {copiedKey === 'summary' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedKey === 'summary' ? 'Kopyalandı!' : 'WhatsApp Özetini Kopyala'}
                  </button>
                </div>

                {/* Lead score / meta */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Skor', value: lead.quality_score || lead.potential_score || '–' },
                    { label: 'Google', value: lead.rating ? `${lead.rating}★` : '–' },
                    { label: 'Yorum', value: lead.review_count || 0 },
                  ].map(m => (
                    <div key={m.label} className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg p-2.5 text-center">
                      <div className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider mb-1">{m.label}</div>
                      <div className="text-sm font-bold text-[var(--text-primary)]">{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Scripts ── */}
          {tab === 'scripts' && (
            <div className="p-5 space-y-4">

              {/* İlk Arama */}
              <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
                  <h3 className="text-[11px] font-bold text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-[var(--accent)]" /> İlk Arama Scripti
                  </h3>
                  {renderCopyBtn("Kopyala", "call", scripts.call)}
                </div>
                <pre className="p-4 text-[11px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap font-sans">
                  {scripts.call}
                </pre>
              </div>

              {/* WhatsApp DM */}
              <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
                  <h3 className="text-[11px] font-bold text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-[var(--accent)]" /> WhatsApp / DM Mesajı
                  </h3>
                  {renderCopyBtn("Kopyala", "wa", scripts.whatsapp)}
                </div>
                <pre className="p-4 text-[11px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap font-sans">
                  {scripts.whatsapp}
                </pre>
              </div>

              {/* İtiraz Karşılama */}
              <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                  <h3 className="text-[11px] font-bold text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-[var(--accent)]" /> İtiraz Karşılama
                  </h3>
                </div>
                <div className="divide-y divide-[var(--border-subtle)]">
                  {OBJECTIONS.map((obj, i) => {
                    const answer = obj.a(scripts.value, scripts.sector, scripts.city)
                    return (
                      <div key={i}>
                        <button
                          onClick={() => setOpenObj(openObj === i ? null : i)}
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--bg-surface)] transition-colors"
                        >
                          <span className="text-[11px] font-semibold text-[var(--text-primary)]">{obj.q}</span>
                          {openObj === i ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />}
                        </button>
                        {openObj === i && (
                          <div className="px-4 pb-4 space-y-3">
                            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{answer}</p>
                            {renderCopyBtn("Yanıtı Kopyala", `obj-${i}`, answer.replace(/^"|"$/g, ''))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-subtle)] flex justify-between items-center bg-[var(--bg-base)]/50 shrink-0">
          <button
            onClick={handleDelete}
            disabled={loading}
            className="flex items-center gap-1.5 text-[var(--danger)] text-[11px] font-bold hover:opacity-70 transition-all uppercase disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" /> Sil
          </button>

          <div className="flex gap-2">
            <button onClick={handleConvertToProject} disabled={loading} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--success)] text-white text-[11px] font-bold rounded-lg hover:opacity-90 transition-all disabled:opacity-50">
              <CheckCircle2 className="w-3.5 h-3.5" /> Projeye Dönüştür
            </button>
            <button onClick={handleSave} disabled={loading} className="px-4 py-2 bg-[var(--cta-bg)] text-[var(--cta-fg)] text-[11px] font-bold rounded-lg hover:bg-[#e6e6e6] transition-all disabled:opacity-50">
              {loading ? 'Kaydediliyor...' : 'Kaydet & Kapat'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
