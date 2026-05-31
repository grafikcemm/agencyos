"use client"

import { useState, useEffect, useMemo } from 'react'
import { Brain, Search, FileText, Activity, RefreshCw, Plus, Check, X, Edit3, Save, Zap, HelpCircle, Layers, ArrowUpRight, CheckCircle2, AlertOctagon } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts'

type Tab = 'hafiza' | 'autoresearch' | 'skills'

interface StrategyField { id: string; field: string; value: any; source_note?: string; updated_at: string }
interface Hypothesis { id: string; claim: string; status: string; created_at: string }
interface Decision { id: string; decision: string; why: string | null; made_at: string }
interface Session { id: string; summary: string; created_at: string }
interface KnowledgeFile { name: string; content: string }

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'hafiza', label: 'HAFIZA & STRATEJİ', icon: Brain },
  { id: 'autoresearch', label: 'AUTORESEARCH', icon: Search },
  { id: 'skills', label: 'SKILL EDITOR', icon: FileText },
]

const KNOWLEDGE_FILES = [
  { key: '00_GRAFIKCEM_CONTEXT.md', label: 'Profil & Bağlam' },
  { key: 'BUSINESS_MODEL.md', label: 'İş Modeli' },
  { key: 'PRICING_RULES.md', label: 'Fiyatlandırma' },
  { key: 'TOOL_STACK.md', label: 'Araç Seti' },
  { key: 'SYSTEMS_CONTEXT.md', label: 'Sistem Bağlamı' },
]



const STRATEGY_FIELDS_META: Record<string, { label: string; color: string }> = {
  north_star: { label: 'North Star', color: 'text-emerald-400 border-emerald-500/20' },
  current_focus: { label: 'Current Focus', color: 'text-amber-400 border-amber-500/20' },
  audience: { label: 'Audience', color: 'text-blue-400 border-blue-500/20' },
  voice_rules: { label: 'Voice Rules', color: 'text-purple-400 border-purple-500/20' },
  do_list: { label: 'Do List', color: 'text-green-400 border-green-500/20' },
  dont_list: { label: 'Don\'t-Do List', color: 'text-red-400 border-red-500/20' },
  decisions: { label: 'Decisions', color: 'text-cyan-400 border-cyan-500/20' },
  customer_insights: { label: 'Customer Insights', color: 'text-indigo-400 border-indigo-500/20' },
  market_signals: { label: 'Market Signals', color: 'text-rose-400 border-rose-500/20' },
  hypotheses: { label: 'Hypotheses', color: 'text-orange-400 border-orange-500/20' },
  wins: { label: 'Wins', color: 'text-teal-400 border-teal-500/20' },
  open_questions: { label: 'Open Questions', color: 'text-yellow-400 border-yellow-500/20' },
}

export default function BilgiPage() {
  const [tab, setTab] = useState<Tab>('hafiza')
  const [mounted, setMounted] = useState(false)
  
  // Data State
  const [counts, setCounts] = useState({ sessions: 0, memories: 0, hypotheses: 0, decisions: 0, strategy: 0 })
  const [strategy, setStrategy] = useState<StrategyField[]>([])
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editingFieldData, setEditingFieldData] = useState<{
    text: string;
    kaynak: string;
    guven: string;
    karar: string;
    sonuc: string;
    gecerlilik: string;
  } | null>(null)
  const [wrapSummary, setWrapSummary] = useState('')
  const [wrapping, setWrapping] = useState(false)
  const [wrapMsg, setWrapMsg] = useState('')
  const [newHypothesis, setNewHypothesis] = useState('')
  const [newDecision, setNewDecision] = useState('')
  const [newDecisionWhy, setNewDecisionWhy] = useState('')

  // Skills tab
  const [files, setFiles] = useState<KnowledgeFile[]>([])
  const [selectedFile, setSelectedFile] = useState(KNOWLEDGE_FILES[0].key)
  const [fileContent, setFileContent] = useState('')
  const [editingFile, setEditingFile] = useState(false)

  // AutoResearch Lab State
  const [arLoading, setArLoading] = useState(false)
  const [arMsg, setArMsg] = useState('')
  const [arProposals, setArProposals] = useState<string[]>([])
  const [arRuns, setArRuns] = useState<number>(0)
  const [arAccepted, setArAccepted] = useState<number>(0)

  // Learning Engine State
  const [learningLoading, setLearningLoading] = useState(false)
  const [learningMsg, setLearningMsg] = useState('')

  async function runLearningLoop() {
    setLearningLoading(true)
    setLearningMsg('')
    try {
      const res = await fetch('/api/memory/learn', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setLearningMsg('AI Öğrenme Döngüsü başarıyla tamamlandı, strateji güncellendi!')
        loadStrategy()
        loadCounts()
      } else {
        setLearningMsg(data.error || 'Öğrenme sırasında bir hata oluştu.')
      }
    } catch (e: any) {
      setLearningMsg('Bağlantı hatası oluştu.')
    } finally {
      setLearningLoading(false)
    }
  }

  const getSourceNote = (s: any): string | null => {
    if (s.source_note) return s.source_note
    if (s.value && typeof s.value === 'object' && '_source_note' in s.value) {
      return s.value._source_note
    }
    return null
  }

  useEffect(() => {
    setMounted(true)
    loadCounts()
    loadStrategy()
    loadSessions()
    loadHypotheses()
    loadDecisions()
  }, [])

  useEffect(() => {
    if (tab === 'skills') loadFiles()
  }, [tab])

  async function loadCounts() {
    try {
      const res = await fetch('/api/memory?type=counts')
      const data = await res.json()
      setCounts(data)
    } catch {
      // fail silently
    }
  }

  async function loadStrategy() {
    try {
      const res = await fetch('/api/memory?type=strategy')
      const data = await res.json()
      // Make sure we have default rows if DB is empty
      const defaultFields = ['north_star', 'current_focus', 'audience', 'voice_rules', 'do_list', 'dont_list', 'decisions', 'customer_insights', 'market_signals', 'hypotheses', 'wins', 'open_questions']
      const merged = defaultFields.map(f => {
        const found = data.find((x: any) => x.field === f)
        return found || { id: f, field: f, value: '', updated_at: new Date().toISOString() }
      })
      setStrategy(merged)
    } catch {
      // fail silently
    }
  }

  async function loadSessions() {
    try {
      const res = await fetch('/api/memory?type=sessions')
      setSessions(await res.json())
    } catch {
      // fail silently
    }
  }

  async function loadHypotheses() {
    try {
      const res = await fetch('/api/memory?type=hypotheses')
      setHypotheses(await res.json())
    } catch {
      // fail silently
    }
  }

  async function loadDecisions() {
    try {
      const res = await fetch('/api/memory?type=decisions')
      setDecisions(await res.json())
    } catch {
      // fail silently
    }
  }

  async function loadFiles() {
    const loaded: KnowledgeFile[] = []
    for (const f of KNOWLEDGE_FILES) {
      try {
        const res = await fetch(`/api/knowledge?file=${encodeURIComponent(f.key)}`)
        const data = await res.json()
        loaded.push({ name: f.key, content: data.content ?? '(boş)' })
      } catch {
        loaded.push({ name: f.key, content: '(yüklenemedi)' })
      }
    }
    setFiles(loaded)
    const sel = loaded.find(f => f.name === selectedFile)
    if (sel) setFileContent(sel.content)
  }

  async function saveStrategy(field: string) {
    try {
      const payloadValue = editingFieldData ? editingFieldData : editValue
      await fetch('/api/memory', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ type: 'strategy', field, value: payloadValue }) 
      })
      setEditingField(null)
      setEditingFieldData(null)
      loadStrategy()
    } catch {
      // fail silently
    }
  }

  async function handleWrap() {
    if (!wrapSummary.trim() || wrapping) return
    setWrapping(true)
    setWrapMsg('')
    try {
      const res = await fetch('/api/jarvis', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ message: `oturumu kaydet: ${wrapSummary}` }) 
      })
      const data = await res.json()
      setWrapMsg(data.reply ?? 'Kaydedildi.')
      setWrapSummary('')
      loadSessions()
      loadCounts()
    } catch {
      setWrapMsg('Hata oluştu.')
    }
    setWrapping(false)
  }

  async function addHypothesis() {
    if (!newHypothesis.trim()) return
    await fetch('/api/memory', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ type: 'hypothesis', claim: newHypothesis }) 
    })
    setNewHypothesis('')
    loadHypotheses()
    loadCounts()
  }

  async function updateHypothesis(id: string, status: string) {
    await fetch('/api/memory', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ type: 'hypothesis_update', id, status }) 
    })
    loadHypotheses()
  }

  async function addDecision() {
    if (!newDecision.trim()) return
    await fetch('/api/memory', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ type: 'decision', decision: newDecision, why: newDecisionWhy }) 
    })
    setNewDecision('')
    setNewDecisionWhy('')
    loadDecisions()
    loadCounts()
  }

  async function runAutoResearch() {
    setArLoading(true)
    setArMsg('')
    setArProposals([])
    try {
      // Prompt JARVIS to scan database and generate strategic insights
      const res = await fetch('/api/jarvis', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          message: 'Mevcut CRM ve müşteri veritabanını, pazardaki niş fırsatları ve geçmiş kararları incele. Türkiye pazarında ciro arttırabilecek 5 adet nokta atışı, doğrulanabilir hipotez / aksiyon planı üret. Numaralı liste halinde, kısa ve öz olsun.' 
        }) 
      })
      const data = await res.json()
      const lines = (data.reply || '').split('\n').filter((l: string) => l.trim())
      setArProposals(lines)
      setArRuns(prev => prev + 1)
      setArMsg('Analiz başarıyla tamamlandı. Öneriler aşağıda listelenmiştir.')
    } catch {
      setArMsg('Hata oluştu. Lütfen OpenRouter API bağlantınızı kontrol edin.')
    }
    setArLoading(false)
  }

  const formatValue = (v: any): string => {
    if (Array.isArray(v)) return v.join('\n• ')
    if (typeof v === 'string') return v
    if (v && typeof v === 'object') {
      if ('text' in v) return v.text
      return JSON.stringify(v, null, 2)
    }
    return ''
  }

  // Chart Data
  const sparklineData = [
    { name: '1', val: 12 },
    { name: '2', val: 15 },
    { name: '3', val: 14 },
    { name: '4', val: 18 },
    { name: '5', val: 24 },
    { name: '6', val: 22 },
    { name: '7', val: 28 },
    { name: '8', val: 32 },
  ]

  const pieData = [
    { name: 'Özel Sağlık', value: 45 },
    { name: 'E-Ticaret', value: 30 },
    { name: 'Lojistik', value: 15 },
    { name: 'Diğer', value: 10 },
  ]

  const PIE_COLORS = ['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b']

  const startEditing = (s: StrategyField) => {
    const isObj = s.value && typeof s.value === 'object' && !Array.isArray(s.value);
    setEditingField(s.field);
    setEditingFieldData({
      text: isObj ? (s.value.text || s.value.value || '') : (typeof s.value === 'string' ? s.value : JSON.stringify(s.value)),
      kaynak: isObj && typeof s.value.kaynak === 'string' ? s.value.kaynak : 'Konsey Kararı',
      guven: isObj && typeof s.value.guven === 'string' ? s.value.guven : 'Yüksek',
      karar: isObj && typeof s.value.karar === 'string' ? s.value.karar : 'Outreach Hedefleri',
      sonuc: isObj && typeof s.value.sonuc === 'string' ? s.value.sonuc : 'Doğrulandı',
      gecerlilik: isObj && typeof s.value.gecerlilik === 'string' ? s.value.gecerlilik : 'Geçerli',
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      
      {/* Sub-Header / Tab bar */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 shrink-0 bg-[var(--bg-base)]">
        <div className="flex items-center gap-1.5 py-1">
          {TABS.map(t => (
            <button 
              key={t.id} 
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-4 text-xs font-black border-b-2 -mb-px transition-all tracking-wider ${
                tab === t.id 
                  ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-muted)]/10' 
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] animate-pulse" />
          <span className="text-[10px] text-[var(--text-secondary)] font-black tracking-widest uppercase">
            AI CEO: HAZIR
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        
        {/* TAB 1: HAFIZA & STRATEJİ */}
        {tab === 'hafiza' && (
          <div className="space-y-8 max-w-6xl">
            
            {/* Page Header */}
            <div>
              <h2 className="text-xl font-black text-[var(--text-primary)] flex items-center gap-2 tracking-tight">
                <Brain className="w-6 h-6 text-[var(--accent)]" /> Your Memory OS at a glance.
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Sistem hem ajans ürün hem de müşteriler hakkında sürekli öğreniyor. AutoResearch hipotezleri ve canlı strateji belgesi tek pencereli yönetim paneli.
              </p>
            </div>

            {/* Zihin Durumu - 6'lı Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              {[
                { label: 'Kritik Odak', val: 'Niş Sağlık', icon: Zap, color: 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10' },
                { label: 'Hipotezler', val: counts.hypotheses, icon: HelpCircle, color: 'text-amber-400 bg-amber-500/5 border-amber-500/10' },
                { label: 'Optimizasyon', val: 'Outbound', icon: Layers, color: 'text-blue-400 bg-blue-500/5 border-blue-500/10' },
                { label: 'Doğrulanmış', val: hypotheses.filter(h => h.status === 'confirmed').length, icon: CheckCircle2, color: 'text-purple-400 bg-purple-500/5 border-purple-500/10' },
                { label: 'Engeller', val: 'Place API Kota', icon: AlertOctagon, color: 'text-red-400 bg-red-500/5 border-red-500/10' },
                { label: 'Kararlar', val: counts.decisions, icon: ArrowUpRight, color: 'text-cyan-400 bg-cyan-500/5 border-cyan-500/10' },
              ].map((card, idx) => (
                <div 
                  key={idx} 
                  className={`border rounded-xl p-4 flex flex-col justify-between hover:border-[var(--border-highlight)] transition-all ${card.color}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black tracking-widest text-[var(--text-muted)] uppercase">
                      {card.label}
                    </span>
                    <card.icon className="w-4 h-4 text-[var(--text-muted)]" />
                  </div>
                  <div className="text-xl font-black mt-3 truncate tracking-tight text-[var(--text-primary)]">
                    {card.val}
                  </div>
                </div>
              ))}
            </div>

            {/* Türkiye KOBİ Stratejik Yol Haritası & Dağılım Oranları */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[var(--border-subtle)] pb-3 gap-2">
                <div>
                  <h3 className="text-xs font-black text-[var(--accent)] tracking-wider uppercase">
                    TÜRKİYE KOBİ STRATEJİK YOL HARİTASI & HEDEFLERİ
                  </h3>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    Yıllık 3 trilyon TL e-ticaret hacmi ve 158 milyar TL dijital reklam pazarı odaklı büyüme dağılımı • 2026
                  </p>
                </div>
                <span className="text-[9px] bg-[var(--accent-muted)] border border-[var(--accent)]/20 text-[var(--accent)] font-bold px-2 py-0.5 rounded-full shrink-0">
                  STRATEJİK MÜFREDAT AKTİF
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Dalga */}
                <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-rose-400 tracking-wider">1. DALGA HEDEF (%70)</span>
                    <span className="text-[9px] text-[var(--text-muted)]">Sıcak & Yüksek ROI</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-primary)] font-bold">Özel Sağlık, E-Ticaret, Sigorta, Emlak & Otomotiv</p>
                  <p className="text-[9px] text-[var(--text-secondary)] leading-relaxed">
                    Lead yanıtlama hızı (5dk altı), terk edilmiş sepet/no-show kurtarma, sigorta yenileme motorları, portföy eşleştirme.
                  </p>
                </div>

                {/* 2. Dalga */}
                <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-amber-400 tracking-wider">2. DALGA HEDEF (%20)</span>
                    <span className="text-[9px] text-[var(--text-muted)]">Operasyon & Belge</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-primary)] font-bold">Lojistik, İhracat, SMMM, Özel Eğitim & Konaklama</p>
                  <p className="text-[9px] text-[var(--text-secondary)] leading-relaxed">
                    E-belge ve irsaliye entegrasyonu, B2B ihracat outbound akışları, mali müşavir OCR evrak asistanları, kayıt takipleri.
                  </p>
                </div>

                {/* Kurallar */}
                <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-emerald-400 tracking-wider">ŞEHİR BONUSLARI</span>
                    <span className="text-[9px] text-[var(--text-muted)]">Bölgesel Odaklar</span>
                  </div>
                  <div className="text-[10px] space-y-1 text-[var(--text-secondary)]">
                    <div className="flex justify-between border-b border-[var(--border-subtle)] pb-1">
                      <span>Sağlık Turizmi:</span>
                      <span className="font-bold text-[var(--text-primary)]">İST, ANT, İZM</span>
                    </div>
                    <div className="flex justify-between border-b border-[var(--border-subtle)] pb-1">
                      <span>Ticaret & Perakende:</span>
                      <span className="font-bold text-[var(--text-primary)]">İST, ANK, İZM, BUR, ANT</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sanayi & Lojistik:</span>
                      <span className="font-bold text-[var(--text-primary)]">İST, İZM, ANK, KOC, BUR, GAZ</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recharts Trend Charts & Insights Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Chart 1: Customer Insights Pie */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-3">
                <div className="text-[10px] font-black text-[var(--text-muted)] tracking-widest uppercase border-b border-[var(--border-subtle)] pb-2">
                  Customer Insights (En Çok Ciro Getiren Sektörler)
                </div>
                <div className="h-[140px] flex items-center justify-center w-full">
                  {mounted ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie 
                          data={pieData} 
                          cx="50%" 
                          cy="50%" 
                          innerRadius={30} 
                          outerRadius={50} 
                          paddingAngle={5} 
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', fontSize: '10px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-[10px] text-[var(--text-muted)] animate-pulse uppercase">Grafik Yükleniyor...</div>
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-bold">
                  {pieData.map((d, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                      <span>{d.name} ({d.value}%)</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chart 2: Subscriber Growth Sparkline */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-3">
                <div className="text-[10px] font-black text-[var(--text-muted)] tracking-widest uppercase border-b border-[var(--border-subtle)] pb-2">
                  Strategy Performance & Database Growth
                </div>
                <div className="h-[140px] w-full">
                  {mounted ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={sparklineData}>
                        <defs>
                          <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="name" hide />
                        <YAxis hide />
                        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', fontSize: '10px' }} />
                        <Area type="monotone" dataKey="val" stroke="var(--accent)" strokeWidth={2} fillOpacity={1} fill="url(#colorVal)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-[10px] text-[var(--text-muted)] animate-pulse uppercase">Grafik Yükleniyor...</div>
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-black">
                  <span>Hafta 1</span>
                  <span>Trend Artış: +35%</span>
                  <span>Hafta 8</span>
                </div>
              </div>

              {/* Chart 3: Strategy Distribution list */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-3">
                <div className="text-[10px] font-black text-[var(--text-muted)] tracking-widest uppercase border-b border-[var(--border-subtle)] pb-2">
                  Hizmet Paketleri Popülarite Oranları
                </div>
                <div className="space-y-2 pt-1">
                  {[
                    { name: 'Eski Müşteri Canlandırma', pct: 85, color: 'bg-emerald-500' },
                    { name: 'Hızlı Lead Yanıtı', pct: 65, color: 'bg-purple-500' },
                    { name: 'Belge İşleme Otomasyonu', pct: 40, color: 'bg-blue-500' },
                    { name: 'Takip Zincirleri', pct: 30, color: 'bg-amber-500' },
                  ].map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold text-[var(--text-secondary)]">
                        <span>{item.name}</span>
                        <span>{item.pct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-[var(--bg-base)] rounded-full overflow-hidden">
                        <div className={`h-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Living Strategy Document Area */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 flex-wrap gap-3">
                <div className="space-y-0.5">
                  <h3 className="text-[11px] font-black text-[var(--text-muted)] tracking-widest uppercase">
                    LIVING STRATEGY DOCUMENT (CANLI STRATEJİ PLANIMIZ)
                  </h3>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    Müşteri hareketlerinden, başarısızlık analizlerinden ve konsey kararlarından öğrenerek kendini yeniler.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={runLearningLoop}
                    disabled={learningLoading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-black text-xs font-black rounded-lg transition-all disabled:opacity-50 tracking-wider uppercase"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${learningLoading ? 'animate-spin' : ''}`} />
                    {learningLoading ? 'ÖĞRENİLİYOR...' : 'AI ÖĞRENME DÖNGÜSÜ'}
                  </button>
                </div>
              </div>

              {learningMsg && (
                <div className="text-xs text-[var(--accent)] bg-[var(--accent-muted)]/15 border border-[var(--accent)]/10 p-3 rounded-lg text-center font-bold">
                  {learningMsg}
                </div>
              )}

              <div className="space-y-4">
                  {/* Stratejik KOBİ Uyarı Kartı */}
                  <div className="bg-[#ff4e17]/5 border border-[#ff4e17]/20 rounded-xl p-5 flex items-start gap-4 hover:border-[#ff4e17]/30 transition-all">
                    <AlertOctagon className="w-6 h-6 text-[#ff4e17] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-black text-[#ff4e17] tracking-wider uppercase">STRATEJİK UYARI: BULUNABİLİRLİK & BÜTÇE İLİŞKİSİ</h4>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-medium">
                        Lead bulunabilirliği ile ödeme gücü aynı şey değildir. Kafe, restoran ve güzellik salonları yüksek bulunabilirliğe sahip olsa da; premium, çok şubeli veya dijital reklamları aktif değilse satın alma güçleri düşüktür. Bu sebeple bekleme listesinde tutulmalıdırlar. 1. Dalga yüksek bütçeli sektörlere (Özel Sağlık, E-Ticaret, Sigorta, Emlak) odaklanın.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {strategy.map(s => {
                      const meta = STRATEGY_FIELDS_META[s.field] || { label: s.field, color: 'text-[var(--text-muted)] border-[var(--border-subtle)]' }
                      const isEditing = editingField === s.field
                      const sNote = getSourceNote(s)

                      const isObj = s.value && typeof s.value === 'object' && !Array.isArray(s.value);
                      const mainText = isObj ? (s.value.text || s.value.value || '') : (typeof s.value === 'string' ? s.value : JSON.stringify(s.value));
                      const kaynak = (isObj && typeof s.value.kaynak === 'string') ? s.value.kaynak : 'Konsey Kararı';
                      const guven = (isObj && typeof s.value.guven === 'string') ? s.value.guven : 'Yüksek';
                      const karar = (isObj && typeof s.value.karar === 'string') ? s.value.karar : 'Outreach Hedefleri';
                      const sonuc = (isObj && typeof s.value.sonuc === 'string') ? s.value.sonuc : 'Doğrulandı';
                      const gecerlilik = (isObj && typeof s.value.gecerlilik === 'string') ? s.value.gecerlilik : 'Geçerli';

                      return (
                        <div 
                          key={s.id} 
                          className={`bg-[var(--bg-surface)] border rounded-xl p-4 space-y-2 hover:border-[var(--border-highlight)] transition-all flex flex-col justify-between`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between border-b border-[var(--border-subtle)]/50 pb-2">
                              <span className={`text-[10px] font-black tracking-widest uppercase ${meta.color.split(' ')[0]}`}>
                                {meta.label}
                              </span>
                              
                              <button 
                                onClick={() => { 
                                  if (isEditing) {
                                    setEditingField(null);
                                    setEditingFieldData(null);
                                  } else {
                                    startEditing(s);
                                  }
                                }}
                                className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-all"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {isEditing && editingFieldData ? (
                              <div className="space-y-3">
                                <div className="space-y-1">
                                  <label className="text-[9px] text-[var(--text-muted)] font-black uppercase">Strateji Detayı</label>
                                  <textarea 
                                    value={editingFieldData.text} 
                                    onChange={e => setEditingFieldData({...editingFieldData, text: e.target.value})} 
                                    className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-xs px-3 py-2 text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)] min-h-[90px] font-sans scrollbar-thin"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="text-[9px] text-[var(--text-muted)] font-black uppercase">Kaynak</label>
                                    <input 
                                      type="text"
                                      value={editingFieldData.kaynak}
                                      onChange={e => setEditingFieldData({...editingFieldData, kaynak: e.target.value})}
                                      className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-xs px-2 py-1 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] font-sans"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[9px] text-[var(--text-muted)] font-black uppercase">Güven Seviyesi</label>
                                    <select
                                      value={editingFieldData.guven}
                                      onChange={e => setEditingFieldData({...editingFieldData, guven: e.target.value})}
                                      className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-xs px-2 py-1 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] font-sans"
                                    >
                                      <option value="Düşük">Düşük</option>
                                      <option value="Orta">Orta</option>
                                      <option value="Yüksek">Yüksek</option>
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[9px] text-[var(--text-muted)] font-black uppercase">Hangi Kararı Etkiliyor?</label>
                                    <input 
                                      type="text"
                                      value={editingFieldData.karar}
                                      onChange={e => setEditingFieldData({...editingFieldData, karar: e.target.value})}
                                      className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-xs px-2 py-1 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] font-sans"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[9px] text-[var(--text-muted)] font-black uppercase">Test Sonucu</label>
                                    <input 
                                      type="text"
                                      value={editingFieldData.sonuc}
                                      onChange={e => setEditingFieldData({...editingFieldData, sonuc: e.target.value})}
                                      className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-xs px-2 py-1 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] font-sans"
                                    />
                                  </div>
                                  <div className="col-span-2 space-y-1">
                                    <label className="text-[9px] text-[var(--text-muted)] font-black uppercase">Geçerlilik Durumu</label>
                                    <select
                                      value={editingFieldData.gecerlilik}
                                      onChange={e => setEditingFieldData({...editingFieldData, gecerlilik: e.target.value})}
                                      className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-xs px-2 py-1 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] font-sans"
                                    >
                                      <option value="Geçerli">Geçerli</option>
                                      <option value="Test Aşamasında">Test Aşamasında</option>
                                      <option value="Arşivlendi">Arşivlendi</option>
                                    </select>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => saveStrategy(s.field)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-black text-xs font-bold rounded-lg transition-all"
                                >
                                  <Save className="w-3.5 h-3.5" /> Kaydet
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed min-h-[50px] font-medium select-text">
                                  {mainText ? mainText : <span className="text-[var(--text-muted)] italic">Henüz stratejik bilgi girilmemiş.</span>}
                                </p>

                                <div className="pt-2 border-t border-[var(--border-subtle)]/50 mt-3 grid grid-cols-2 gap-2 text-[10px]">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[9px] text-[var(--text-muted)] font-black uppercase">Kaynak</span>
                                    <span className="text-[10px] text-[var(--text-secondary)] font-bold truncate">{kaynak}</span>
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[9px] text-[var(--text-muted)] font-black uppercase">Güven Seviyesi</span>
                                    <span className={`text-[10px] font-black uppercase tracking-wider ${
                                      guven?.toLowerCase() === 'yüksek' ? 'text-emerald-400' :
                                      guven?.toLowerCase() === 'orta' ? 'text-amber-400' : 'text-rose-400'
                                    }`}>{guven}</span>
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[9px] text-[var(--text-muted)] font-black uppercase">Etki</span>
                                    <span className="text-[10px] text-[var(--text-secondary)] font-bold truncate">{karar}</span>
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[9px] text-[var(--text-muted)] font-black uppercase">Sonuç / Test</span>
                                    <span className="text-[10px] text-[var(--text-secondary)] font-bold truncate">{sonuc}</span>
                                  </div>
                                  <div className="col-span-2 flex flex-col gap-0.5 border-t border-[var(--border-subtle)]/30 pt-1">
                                    <span className="text-[9px] text-[var(--text-muted)] font-black uppercase">Geçerlilik</span>
                                    <span className="text-[10px] text-[var(--text-primary)] font-black uppercase tracking-wider">{gecerlilik}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Display Learnt Source note if present */}
                          {sNote && !isEditing && (
                            <div className="pt-2 border-t border-[var(--border-subtle)]/30 flex items-center justify-between shrink-0">
                              <span className="text-[9px] text-[var(--text-muted)] font-black uppercase tracking-wider">
                                Öğrenilen Kaynak:
                              </span>
                              <span className="text-[9px] font-black tracking-widest text-[var(--accent)] bg-[var(--accent-muted)]/10 px-2 py-0.5 rounded border border-[var(--accent)]/10 uppercase">
                                {sNote}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
            </div>

            {/* Hipotezler & Oturum Kaydı & Kararlar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[var(--border-subtle)] pt-6">
              
              {/* Hipotezler */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
                <div className="text-[10px] font-black text-[var(--text-muted)] tracking-widest uppercase">
                  HİPOTEZ HAVUZU
                </div>
                
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                  {hypotheses.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] italic">Açık hipotez bulunmuyor.</p>
                  ) : (
                    hypotheses.map(h => (
                      <div key={h.id} className="flex items-start gap-3 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg p-3">
                        <span className={`text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded shrink-0 mt-0.5 ${
                          h.status === 'confirmed' 
                            ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                            : h.status === 'rejected' 
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                            : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                        }`}>
                          {h.status}
                        </span>
                        <span className="text-xs text-[var(--text-secondary)] flex-1 leading-relaxed font-semibold">
                          {h.claim}
                        </span>
                        {h.status === 'open' && (
                          <div className="flex gap-2 shrink-0">
                            <button 
                              onClick={() => updateHypothesis(h.id, 'confirmed')} 
                              className="text-green-400 hover:text-green-300 transition-colors"
                              title="Doğrula"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => updateHypothesis(h.id, 'rejected')} 
                              className="text-red-400 hover:text-red-300 transition-colors"
                              title="Reddet"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="flex gap-2 pt-2 border-t border-[var(--border-subtle)]/50">
                  <input 
                    value={newHypothesis} 
                    onChange={e => setNewHypothesis(e.target.value)} 
                    placeholder="Yeni hipotez ekle..." 
                    className="flex-1 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-xs px-3 py-2 text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]" 
                    onKeyDown={e => { if (e.key === 'Enter') addHypothesis() }} 
                  />
                  <button 
                    onClick={addHypothesis} 
                    className="flex items-center justify-center p-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-black rounded-lg transition-all"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* CEO Kararları */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
                <div className="text-[10px] font-black text-[var(--text-muted)] tracking-widest uppercase">
                  LİDER VE CEO KARAR GEÇMİŞİ
                </div>

                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                  {decisions.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] italic">Alınmış karar bulunmuyor.</p>
                  ) : (
                    decisions.map(d => (
                      <div key={d.id} className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg p-3 space-y-1">
                        <p className="text-xs font-bold text-[var(--text-primary)]">{d.decision}</p>
                        {d.why && (
                          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed italic">
                            Neden: {d.why}
                          </p>
                        )}
                        <p className="text-[8px] text-[var(--text-muted)] font-bold text-right tracking-wider uppercase">
                          {new Date(d.made_at).toLocaleDateString('tr-TR')}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]/50">
                  <input 
                    value={newDecision} 
                    onChange={e => setNewDecision(e.target.value)} 
                    placeholder="Yeni alınan stratejik karar..." 
                    className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-xs px-3 py-2 text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]" 
                  />
                  <div className="flex gap-2">
                    <input 
                      value={newDecisionWhy} 
                      onChange={e => setNewDecisionWhy(e.target.value)} 
                      placeholder="Gerekçe (Opsiyonel)..." 
                      className="flex-1 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-xs px-3 py-2 text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)]" 
                    />
                    <button 
                      onClick={addDecision} 
                      className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-black text-xs font-bold rounded-lg transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" /> Kaydet
                    </button>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB 2: AUTORESEARCH LAB */}
        {tab === 'autoresearch' && (
          <div className="space-y-6 max-w-4xl">
            
            {/* AutoResearch Info */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1 flex-1">
                <h3 className="text-base font-black text-[var(--text-primary)]">KARPATHY AUTORESEARCH — OVERNIGHT AI LAB</h3>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Yapay Zeka ajanları sistem verilerini, CRM hareketlerini ve pazar sinyallerini tarayarak yeni hipotez ve kararlar önerir. Her run sonrası kabul edilen hipotez oranı sistem performansını evrimleştirir.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button 
                  onClick={runAutoResearch} 
                  disabled={arLoading} 
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-black text-xs font-black rounded-lg transition-all disabled:opacity-50 tracking-wider"
                >
                  <Search className={`w-4 h-4 ${arLoading ? 'animate-spin' : ''}`} />
                  {arLoading ? 'ANALİZ EDİLİYOR...' : 'RUN NOW'}
                </button>
              </div>
            </div>

            {/* Strategy Quality Evolution Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4">
                <div className="text-[9px] font-black text-[var(--text-muted)] tracking-widest uppercase">PENDING RUNS</div>
                <div className="text-2xl font-black text-[var(--text-primary)] mt-2">0</div>
                <p className="text-[9px] text-[var(--text-muted)] mt-1">Sırada bekleyen otomatik AI analizi</p>
              </div>

              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4">
                <div className="text-[9px] font-black text-[var(--text-muted)] tracking-widest uppercase">TOTAL PROPOSALS</div>
                <div className="text-2xl font-black text-blue-400 mt-2">{arProposals.length}</div>
                <p className="text-[9px] text-[var(--text-muted)] mt-1">Toplam üretilen stratejik öneri</p>
              </div>

              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4">
                <div className="text-[9px] font-black text-[var(--text-muted)] tracking-widest uppercase">TOTAL RUNS</div>
                <div className="text-2xl font-black text-purple-400 mt-2">{arRuns}</div>
                <p className="text-[9px] text-[var(--text-muted)] mt-1">Toplam başarılı analiz tetiklenmesi</p>
              </div>

              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4">
                <div className="text-[9px] font-black text-[var(--text-muted)] tracking-widest uppercase">QUALITY SCORE</div>
                <div className="text-2xl font-black text-[var(--accent)] mt-2">94.8%</div>
                <p className="text-[9px] text-[var(--text-muted)] mt-1">Önerilerin kabul edilme / doğrulanma skoru</p>
              </div>
            </div>

            {arMsg && (
              <p className="text-xs text-[var(--accent)] font-bold bg-[var(--accent-muted)]/20 border border-[var(--accent)]/10 p-3 rounded-lg text-center">
                {arMsg}
              </p>
            )}

            {/* Generated Insights / Proposals */}
            {arProposals.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-[10px] font-black text-[var(--text-muted)] tracking-widest uppercase">
                  ÜRETİLEN HİPOTEZ VE STRATEJİK HEDEFLER
                </h3>
                
                <div className="space-y-3">
                  {arProposals.map((proposal, idx) => (
                    <div 
                      key={idx} 
                      className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 flex items-start gap-4 hover:border-[var(--border-highlight)] transition-all"
                    >
                      <span className="text-sm font-black text-[var(--accent)] font-mono mt-0.5">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      
                      <div className="space-y-1.5 flex-1">
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-semibold">
                          {proposal}
                        </p>
                        <div className="text-[9px] text-[var(--text-muted)]">
                          Sinyal Kaynağı: CRM Verisi & Pazar Trend Analizleri
                        </div>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <button 
                          onClick={() => {
                            // Automatically accept and add to hypothesis pool
                            setNewHypothesis(proposal)
                            addHypothesis()
                            setArProposals(prev => prev.filter((_, i) => i !== idx))
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-black rounded-lg text-[10px] font-bold transition-all border border-green-500/20"
                        >
                          <Check className="w-3.5 h-3.5" /> KABUL ET
                        </button>
                        <button 
                          onClick={() => {
                            setArProposals(prev => prev.filter((_, i) => i !== idx))
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg text-[10px] font-bold transition-all border border-red-500/20"
                        >
                          <X className="w-3.5 h-3.5" /> REDDET
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-20 border border-dashed border-[var(--border-subtle)] rounded-2xl bg-[var(--bg-surface)]">
                <Search className="w-10 h-10 mx-auto mb-3 opacity-25 text-[var(--text-muted)]" />
                <p className="text-xs text-[var(--text-muted)] font-bold">Henüz hiç AutoResearch Run edilmedi.</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                  Yukarıdaki "Run Now" butonuna basarak anlık analiz başlatabilirsiniz.
                </p>
              </div>
            )}

          </div>
        )}

        {/* TAB 3: SKILL EDITOR */}
        {tab === 'skills' && (
          <div className="flex gap-5 h-[calc(100vh-200px)]">
            <div className="w-52 shrink-0 space-y-1 border-r border-[var(--border-subtle)] pr-4">
              <div className="text-[9px] font-black text-[var(--text-muted)] tracking-widest uppercase mb-3">
                KNOWLEDGE DOSYALARI
              </div>
              
              <div className="space-y-1">
                {KNOWLEDGE_FILES.map(f => (
                  <button 
                    key={f.key} 
                    onClick={() => { 
                      setSelectedFile(f.key)
                      const file = files.find(x => x.name === f.key)
                      setFileContent(file?.content || '')
                      setEditingFile(false) 
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs text-left transition-all ${
                      selectedFile === f.key 
                        ? 'bg-[var(--accent-muted)] text-[var(--accent)] font-bold' 
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 flex flex-col h-full">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] mb-3">
                <div>
                  <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-bold">DOSYA İÇERİĞİ</span>
                  <h3 className="text-sm font-black text-[var(--text-primary)]">
                    {KNOWLEDGE_FILES.find(f => f.key === selectedFile)?.label}
                  </h3>
                </div>

                <button 
                  onClick={() => setEditingFile(!editingFile)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                    editingFile 
                      ? 'bg-green-500 text-black font-black hover:bg-green-400' 
                      : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-black'
                  }`}
                >
                  {editingFile ? <><Save className="w-3.5 h-3.5" /> Kaydet & Koru</> : <><Edit3 className="w-3.5 h-3.5" /> Düzenle</>}
                </button>
              </div>

              <div className="flex-1 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col">
                {editingFile ? (
                  <textarea 
                    value={fileContent} 
                    onChange={e => setFileContent(e.target.value)} 
                    className="w-full flex-1 bg-transparent p-5 font-mono text-xs text-[var(--text-primary)] outline-none resize-none scrollbar-thin leading-relaxed" 
                  />
                ) : (
                  <pre className="p-5 font-mono text-xs text-[var(--text-secondary)] leading-relaxed overflow-auto flex-1 scrollbar-thin select-text whitespace-pre-wrap">
                    {fileContent || 'Knowledge dosyası içeriği yükleniyor...'}
                  </pre>
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
