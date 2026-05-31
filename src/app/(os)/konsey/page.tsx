"use client"

import { useState, useEffect } from 'react'
import {
  Users,
  Compass,
  Shield,
  Cog,
  TrendingUp,
  UserCheck,
  Zap,
  HelpCircle,
  CheckCircle,
  XCircle,
  ArrowRight,
  Database,
  Info,
  Maximize2,
  Minimize2,
  ListFilter,
  CheckSquare,
  AlertTriangle
} from 'lucide-react'

type AgentId = 'strategy' | 'risk' | 'operations' | 'growth' | 'president'

interface AgentMeta {
  id: AgentId
  name: string
  role: string
  focus: string
  tags: string[]
  icon: any
  color: string
  accentColor: string
}

const AGENTS: AgentMeta[] = [
  {
    id: 'strategy',
    name: 'STRATEJİ',
    role: 'Strateji Direktörü',
    focus: 'Teklif, konumlandırma, fiyat',
    tags: ['KONUMLANDIRMA ODAKLI', 'ROI ODAKLI MESAJ'],
    icon: Compass,
    color: 'text-purple-400 border-purple-500/20 bg-purple-500/5',
    accentColor: 'text-purple-400'
  },
  {
    id: 'risk',
    name: 'RİSK',
    role: 'Risk & Uyum',
    focus: 'Güvenlik, gizlilik, gerçekçilik',
    tags: ['SLA ODAKLI', 'ÖNCE GÜVENLİK'],
    icon: Shield,
    color: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
    accentColor: 'text-amber-400'
  },
  {
    id: 'operations',
    name: 'OPERASYON',
    role: 'Operasyon Şefi',
    focus: 'Teslimat, checklist, izleme',
    tags: ['CHECKLIST\'Çİ', 'TESLİMAT ODAKLI'],
    icon: Cog,
    color: 'text-blue-400 border-blue-500/20 bg-blue-500/5',
    accentColor: 'text-blue-400'
  },
  {
    id: 'growth',
    name: 'BÜYÜME',
    role: 'Büyüme Direktörü',
    focus: 'Outbound, mesajlar, dağıtım',
    tags: ['İÇERİK + DM', 'SICAK REFERANS'],
    icon: TrendingUp,
    color: 'text-rose-400 border-rose-500/20 bg-rose-500/5',
    accentColor: 'text-rose-400'
  },
  {
    id: 'president',
    name: 'BAŞKAN',
    role: 'Yönetim Kurulu Başkanı',
    focus: 'Sentez + karar',
    tags: ['GERÇEKÇİLİK KONTROLÜ', 'KARAR ODAKLI'],
    icon: UserCheck,
    color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
    accentColor: 'text-emerald-400'
  }
]

interface ParsedDecision {
  verdict: 'continue' | 'pause' | 'reject' | 'needs_more_data'
  confidence: number
  recommendedAction: string
  risks: string[]
  requiredData: string[]
  nextSteps: string[]
  chairmanOpinion: string
  outcome?: 'correct' | 'incorrect'
}

const parsePresidentFeedback = (feedbackStr: string): ParsedDecision | null => {
  if (!feedbackStr) return null
  try {
    const data = JSON.parse(feedbackStr)
    if (data && (data.verdict || data.confidence !== undefined || data.chairmanOpinion)) {
      return {
        verdict: data.verdict || 'needs_more_data',
        confidence: typeof data.confidence === 'number' ? data.confidence : 0,
        recommendedAction: data.recommendedAction || '',
        risks: Array.isArray(data.risks) ? data.risks : [],
        requiredData: Array.isArray(data.requiredData) ? data.requiredData : [],
        nextSteps: Array.isArray(data.nextSteps) ? data.nextSteps : [],
        chairmanOpinion: data.chairmanOpinion || '',
        outcome: data.outcome
      }
    }
  } catch (e) {
    // Graceful fallback if not valid JSON
  }
  return null
}

export default function KonseyPage() {
  // Input State
  const [topic, setTopic] = useState('')
  const [context, setContext] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState('')
  
  // Data State
  const [leads, setLeads] = useState<any[]>([])
  const [debates, setDebates] = useState<any[]>([])
  const [activeAgent, setActiveAgent] = useState<AgentId>('strategy')
  const [isPresidentExpanded, setIsPresidentExpanded] = useState(false)
  const [fallbackMode, setFallbackMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  
  // Active Debate Result
  const [currentDebate, setCurrentDebate] = useState<any | null>(null)
  
  // Streaming text simulation indices (for retro typewriter feel)
  const [streamedText, setStreamedText] = useState<Record<AgentId, string>>({
    strategy: '',
    risk: '',
    operations: '',
    growth: '',
    president: ''
  })

  useEffect(() => {
    loadLeads()
    loadDebates()
  }, [])

  // Keyboard Navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift + ArrowLeft/Right to navigate between agents
      if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        const idx = AGENTS.findIndex(a => a.id === activeAgent)
        if (e.key === 'ArrowLeft') {
          const nextIdx = (idx - 1 + AGENTS.length) % AGENTS.length
          setActiveAgent(AGENTS[nextIdx].id)
        } else {
          const nextIdx = (idx + 1) % AGENTS.length
          setActiveAgent(AGENTS[nextIdx].id)
        }
      }
      // Enter to expand Synthesis if President is selected
      else if (e.key === 'Enter' && !e.shiftKey && activeAgent === 'president' && currentDebate) {
        e.preventDefault()
        setIsPresidentExpanded(prev => !prev)
      }
      // Shift + Enter to Accept
      else if (e.shiftKey && e.key === 'Enter' && currentDebate && currentDebate.status === 'pending') {
        e.preventDefault()
        handleDecision('approved')
      }
      // Shift + Backspace to Veto
      else if (e.shiftKey && e.key === 'Backspace' && currentDebate && currentDebate.status === 'pending') {
        e.preventDefault()
        handleDecision('vetoed')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeAgent, currentDebate])

  async function loadLeads() {
    try {
      const res = await fetch('/api/db/leads?status=new')
      const data = await res.json()
      if (Array.isArray(data)) {
        setLeads(data)
      }
    } catch (e) {
      console.error('Failed to load leads:', e)
    }
  }

  async function loadDebates() {
    try {
      const res = await fetch('/api/council')
      const data = await res.json()
      if (data.debates) {
        setDebates(data.debates)
      }
      if (data.fallback) {
        setFallbackMode(true)
      }
    } catch (e) {
      console.error('Failed to load debates:', e)
      setFallbackMode(true)
    }
  }

  // Handle lead dropdown selection
  const handleLeadChange = (leadId: string) => {
    setSelectedLeadId(leadId)
    if (!leadId) {
      setTopic('')
      setContext('')
      return
    }
    const lead = leads.find(l => l.id === leadId)
    if (lead) {
      setTopic(`${lead.business_name} Hedefleme Tartışması`)
      setContext(`${lead.business_name} firmasını Grafikcem hedeflerine ekleyip yapay zeka otomasyon paketlerimizi sunalım mı? Google Puanı: ${lead.rating || 'Girilmemiş'}, Yorum: ${lead.review_count || 0}, Sektör: ${lead.sector || 'Belirtilmemiş'}`)
    }
  }

  // Trigger parallel LLM calls to convene the council
  const handleConvene = async () => {
    if (!topic.trim()) return
    setLoading(true)
    setCurrentDebate(null)
    setStreamedText({
      strategy: '',
      risk: '',
      operations: '',
      growth: '',
      president: ''
    })

    try {
      const res = await fetch('/api/council', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          context,
          leadId: selectedLeadId || undefined
        })
      })

      const result = await res.json()
      if (result.success) {
        setCurrentDebate(result)
        if (result.fallback) {
          setFallbackMode(true)
        }
        
        // Populate local state debates list if running in fallback mode
        if (result.fallback) {
          setDebates(prev => [result, ...prev])
        } else {
          loadDebates()
        }

        // Simulate typing animation sequentially for each agent
        animateTyping(result)
      }
    } catch (e) {
      console.error('Convene Error:', e)
    } finally {
      setLoading(false)
    }
  }

  // Handle Approve / Veto keputusan
  const handleDecision = async (status: 'approved' | 'vetoed') => {
    if (!currentDebate || actionLoading) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/council', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentDebate.id,
          status,
          leadId: currentDebate.lead_id
        })
      })

      const data = await res.json()
      if (data.success) {
        // preserve existing JSON attributes while updating status
        setCurrentDebate((prev: any) => prev ? { ...prev, status } : null)
        
        if (fallbackMode) {
          setDebates(prev => prev.map(d => d.id === currentDebate.id ? { ...d, status } : d))
        } else {
          loadDebates()
        }

        // reload leads list in case a lead's status is upgraded
        loadLeads()
      }
    } catch (e) {
      console.error('Decision Error:', e)
    } finally {
      setActionLoading(false)
    }
  }

  // Handle outcome accuracy rating (Sonuç doğru/yanlış çıktı mı?)
  const handleOutcome = async (outcome: 'correct' | 'incorrect') => {
    if (!currentDebate || actionLoading) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/council', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentDebate.id,
          outcome,
          leadId: currentDebate.lead_id
        })
      })

      const result = await res.json()
      if (result.success) {
        const updatedDebate = result.data || {
          ...currentDebate,
          president_feedback: JSON.stringify({
            ...JSON.parse(currentDebate.president_feedback || '{}'),
            outcome
          })
        }
        setCurrentDebate(updatedDebate)
        
        if (fallbackMode) {
          setDebates(prev => prev.map(d => d.id === currentDebate.id ? updatedDebate : d))
        } else {
          loadDebates()
        }
      }
    } catch (e) {
      console.error('Outcome Rating Error:', e)
    } finally {
      setActionLoading(false)
    }
  }

  // Typewriter effect simulation for parallel response rendering
  const animateTyping = (data: any) => {
    const agents: AgentId[] = ['strategy', 'risk', 'operations', 'growth', 'president']
    
    agents.forEach(agentId => {
      const field = `${agentId === 'operations' ? 'operations' : agentId}_feedback`
      let fullText = data[field] || ''
      
      // If the president agent and the text is JSON, extract chairmanOpinion to animate typing!
      if (agentId === 'president') {
        try {
          const parsed = JSON.parse(fullText)
          if (parsed && parsed.chairmanOpinion) {
            fullText = parsed.chairmanOpinion
          }
        } catch (e) {
          // fallback
        }
      }

      let currentLength = 0
      
      const interval = setInterval(() => {
        currentLength += Math.min(15, fullText.length - currentLength)
        setStreamedText(prev => ({
          ...prev,
          [agentId]: fullText.substring(0, currentLength)
        }))
        
        if (currentLength >= fullText.length) {
          clearInterval(interval)
        }
      }, 30)
    })
  }

  // Display past debate detail
  const handleSelectPastDebate = (d: any) => {
    setCurrentDebate(d)
    
    let presidentText = d.president_feedback || ''
    try {
      const parsed = JSON.parse(presidentText)
      if (parsed && parsed.chairmanOpinion) {
        presidentText = parsed.chairmanOpinion
      }
    } catch (e) {}

    setStreamedText({
      strategy: d.strategy_feedback,
      risk: d.risk_feedback,
      operations: d.operations_feedback,
      growth: d.growth_feedback,
      president: presidentText
    })
    setSelectedLeadId(d.lead_id || '')
    setTopic(d.topic)
  }

  const parsedPresident = parsePresidentFeedback(currentDebate?.president_feedback)

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-base)]">
      
      {/* Keyboard Guide Header banner */}
      <div className="bg-[var(--accent-muted)]/10 border-b border-[var(--border-subtle)] px-6 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-[var(--accent)] animate-pulse" />
          <span className="text-[10px] font-black tracking-widest text-[var(--text-secondary)] uppercase">
            JARVIS KONSEYYİ
          </span>
          <span className="text-[9px] text-[var(--text-muted)] font-medium border-l border-[var(--border-subtle)] pl-3">
            STRATEJİK BİR KARAR KONUSU GETİR. 5 ROL AJANI PARALEL DÜŞÜNÜR. SHIFT + ← / → İLE GEZ, ENTER GENİŞLET, SHIFT + ENTER KABUL, SHIFT + BACKSPACE VETO.
          </span>
        </div>

        {fallbackMode && (
          <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-black px-2 py-0.5 rounded flex items-center gap-1 uppercase tracking-widest shrink-0 animate-pulse">
            <Database className="w-2.5 h-2.5" /> OTURUM MODU (YEREL HAFIZA)
          </span>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Side: Debate Input Panel & Past Debates History */}
        <div className="w-[340px] border-r border-[var(--border-subtle)] bg-[var(--bg-base)] p-5 flex flex-col gap-5 overflow-y-auto shrink-0 scrollbar-thin">
          
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-black text-[var(--text-primary)] flex items-center gap-2">
                <Users className="w-5 h-5 text-[var(--accent)]" /> AI Kurul Kadrosu
              </h2>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Hedefleme kararlarından önce yapay zeka kurulunun paralel departman görüşlerini sentezleyin.
              </p>
            </div>

            {/* KOBİ lead selector dropdown */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider uppercase block">
                Taranmış KOBİ'ler
              </label>
              <div className="relative">
                <select
                  value={selectedLeadId}
                  onChange={e => handleLeadChange(e.target.value)}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs px-3 py-2 text-[var(--text-primary)] appearance-none outline-none focus:border-[var(--accent)] cursor-pointer pr-8 font-medium"
                >
                  <option value="">-- Müşteri Seç (Opsiyonel) --</option>
                  {leads.map(lead => (
                    <option key={lead.id} value={lead.id}>
                      {lead.business_name} ({lead.sector || 'Sağlık'})
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
                  <ListFilter className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Decision Topic input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider uppercase block">
                Karar Konusu
              </label>
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Örn: Diş Hekimi Ahmet Bey Hedefleme..."
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] font-semibold"
              />
            </div>

            {/* Context/Background textarea */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider uppercase block">
                Arka Plan Bağlamı
              </label>
              <textarea
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="Karar verilmesi gereken durumun detaylarını ve pazar koşullarını buraya girin..."
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] min-h-[100px] max-h-[200px] scrollbar-thin leading-relaxed font-medium"
              />
            </div>

            <button
              onClick={handleConvene}
              disabled={loading || !topic.trim()}
              className="w-full flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-black text-xs font-black py-2.5 rounded-lg transition-all disabled:opacity-50 tracking-wider uppercase"
            >
              <Zap className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'KURUL TARTIŞIYOR...' : 'Konseyi Topla'}
            </button>
          </div>

          {/* Past debates history list */}
          <div className="flex-1 flex flex-col gap-2 pt-4 border-t border-[var(--border-subtle)]">
            <h3 className="text-[10px] font-black text-[var(--text-muted)] tracking-widest uppercase">
              GEÇMİŞ TARTIŞMALAR
            </h3>

            <div className="flex-1 space-y-1.5 overflow-y-auto pr-1 scrollbar-thin max-h-[220px] md:max-h-none">
              {debates.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] italic py-4 text-center">Henüz hiç konsey toplanmadı.</p>
              ) : (
                debates.map((d, idx) => {
                  const parsed = parsePresidentFeedback(d.president_feedback)
                  return (
                    <button
                      key={d.id || idx}
                      onClick={() => handleSelectPastDebate(d)}
                      className={`w-full text-left p-3 rounded-lg border text-xs transition-all flex flex-col gap-1.5 ${
                        currentDebate?.id === d.id
                          ? 'border-[var(--accent)] bg-[var(--accent-muted)]/10 text-[var(--text-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold truncate max-w-[170px]">{d.topic}</span>
                        <span className={`text-[8px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded border ${
                          d.status === 'approved'
                            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                            : d.status === 'vetoed'
                            ? 'text-red-400 bg-red-500/10 border-red-500/20'
                            : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                        }`}>
                          {d.status === 'approved' ? 'ONAYLI' : d.status === 'vetoed' ? 'VETO' : 'BEKLEMEDE'}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-[var(--text-muted)] font-mono">
                          {new Date(d.created_at).toLocaleDateString('tr-TR')}
                        </span>
                        
                        {parsed?.outcome && (
                          <span className={`text-[8px] font-black tracking-wider uppercase px-1 py-0.2 rounded border ${
                            parsed.outcome === 'correct'
                              ? 'text-emerald-400 bg-emerald-500/5 border-emerald-500/15'
                              : 'text-red-400 bg-red-500/5 border-red-500/15'
                          }`}>
                            {parsed.outcome === 'correct' ? 'İSABETLİ 👍' : 'YANILDI 👎'}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

        </div>

        {/* Right Side: Visual Board & Debate Terminal */}
        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto bg-[var(--bg-base)] select-none scrollbar-thin">
          
          {/* 5-Agent Interactive Deck */}
          <div className="grid grid-cols-5 gap-3 shrink-0">
            {AGENTS.map((agent) => {
              const Icon = agent.icon
              const isActive = activeAgent === agent.id
              const hasResponse = currentDebate ? !!(currentDebate[`${agent.id === 'operations' ? 'operations' : agent.id}_feedback`]) : false
              
              return (
                <button
                  key={agent.id}
                  onClick={() => setActiveAgent(agent.id)}
                  className={`border rounded-xl p-4 flex flex-col text-left justify-between hover:border-[var(--border-highlight)] transition-all relative overflow-hidden ${
                    isActive 
                      ? 'border-[var(--accent)] bg-[var(--accent-muted)]/5 ring-1 ring-[var(--accent)]/30' 
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                  }`}
                >
                  {/* Status Indicator */}
                  <div className="absolute top-4 right-4 flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${hasResponse ? 'bg-[var(--accent)] animate-pulse' : 'bg-[var(--text-muted)]'}`} />
                    <span className="text-[8px] font-bold text-[var(--text-muted)] tracking-wider uppercase">
                      {hasResponse ? 'HAZIR' : 'BEKLİYOR'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] ${agent.accentColor}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-[var(--text-muted)] tracking-widest block uppercase">
                          {agent.name}
                        </span>
                        <span className="text-xs font-bold text-[var(--text-primary)] block truncate max-w-[120px]">
                          {agent.role}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] text-[var(--text-muted)] leading-relaxed italic font-medium">
                      {agent.focus}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {agent.tags.map((t, i) => (
                        <span key={i} className="text-[8px] font-black tracking-wider text-[var(--text-muted)] border border-[var(--border-subtle)] px-1 rounded bg-[var(--bg-base)]">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Active Agent Debate Output Terminal */}
          <div className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 flex flex-col gap-4 min-h-[300px] relative">
            
            {/* Terminal Window Header controls */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/40" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/40" />
                <div className="w-3 h-3 rounded-full bg-green-500/40" />
                <span className="text-[10px] font-black tracking-widest text-[var(--text-muted)] uppercase border-l border-[var(--border-subtle)] pl-3 ml-1">
                  AJAN TARTIŞMA ODASI // {AGENTS.find(a => a.id === activeAgent)?.role.toUpperCase()}
                </span>
              </div>

              {activeAgent === 'president' && currentDebate && (
                <button
                  onClick={() => setIsPresidentExpanded(prev => !prev)}
                  className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-all flex items-center gap-1 text-[10px] font-bold"
                  title="Tam ekrana genişlet"
                >
                  {isPresidentExpanded ? (
                    <><Minimize2 className="w-3.5 h-3.5" /> Küçült</>
                  ) : (
                    <><Maximize2 className="w-3.5 h-3.5" /> Tam Ekran</>
                  )}
                </button>
              )}
            </div>

            {/* Debate Terminal Screen Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin pr-1 select-text">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-20 text-center">
                  <div className="w-8 h-8 rounded-full border-2 border-t-[var(--accent)] border-[var(--border-subtle)] animate-spin" />
                  <p className="text-xs text-[var(--text-muted)] font-black tracking-widest uppercase">
                    Kurul kadrosu paralel olarak düşünüyor, riskleri ve potansiyeli tartışıyor...
                  </p>
                </div>
              ) : currentDebate ? (
                <div className={`space-y-4 max-w-4xl leading-relaxed ${isPresidentExpanded && activeAgent === 'president' ? 'text-sm' : 'text-xs'}`}>
                  {/* Title banner */}
                  <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] p-4 rounded-xl space-y-1">
                    <span className="text-[8px] font-black text-[var(--accent)] tracking-widest uppercase">
                      TARTIŞILAN LİMİT / NİŞ KONU
                    </span>
                    <h1 className="text-sm font-black text-[var(--text-primary)]">{currentDebate.topic}</h1>
                  </div>

                  {/* Render content based on active agent */}
                  {activeAgent === 'president' && parsedPresident ? (
                    <div className="space-y-6 mt-4">
                      {/* 1. Karar Konusu & Arka Plan Bağlamı */}
                      <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] p-4 rounded-xl space-y-2">
                        <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2 mb-2">
                          <span className="text-[8px] font-black text-[var(--accent)] tracking-widest uppercase">
                            STRATEJİK BAĞLAM & KARAR DETAYLARI
                          </span>
                          {currentDebate.created_at && (
                            <span className="text-[9px] text-[var(--text-muted)] font-mono">
                              Oluşturma Tarihi: {new Date(currentDebate.created_at).toLocaleDateString('tr-TR')}
                            </span>
                          )}
                        </div>
                        <h2 className="text-sm font-black text-[var(--text-primary)]">{currentDebate.topic}</h2>
                        {context && (
                          <div className="space-y-1">
                            <span className="text-[8px] font-black text-[var(--text-muted)] tracking-wider block uppercase">ARKA PLAN / BAĞLAM:</span>
                            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed italic bg-[var(--bg-surface)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
                              {context}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* 2. Veto Bilgisi (Veto var mı?) */}
                      {currentDebate.status === 'vetoed' && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-[9px] font-black tracking-widest uppercase block">KONSENSÜS VETOSU</span>
                            <p className="text-xs font-bold mt-1">Bu karar stratejik veya bütçesel sebeplerden ötürü veto edilerek rafa kaldırılmıştır.</p>
                          </div>
                        </div>
                      )}

                      {/* 3. Structured Decision Top Grid */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* Verdict Card */}
                        <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl p-4 flex flex-col justify-between">
                          <div>
                            <span className="text-[9px] font-black text-[var(--text-muted)] tracking-widest block uppercase">NİHAİ KURUL KARARI</span>
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 mt-3 rounded-full border text-[11px] font-black uppercase tracking-wider ${
                              parsedPresident.verdict === 'continue'
                                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                : parsedPresident.verdict === 'pause'
                                ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                                : parsedPresident.verdict === 'reject'
                                ? 'text-red-400 bg-red-500/10 border-red-500/20'
                                : 'text-purple-400 bg-purple-500/10 border-purple-500/20'
                            }`}>
                              {parsedPresident.verdict === 'continue' && '✅ DEVAM / HEDEFE AL'}
                              {parsedPresident.verdict === 'pause' && '⏳ DURAKLAT / BEKLET'}
                              {parsedPresident.verdict === 'reject' && '❌ REDDET / RAFA KALDIR'}
                              {parsedPresident.verdict === 'needs_more_data' && '❓ EK VERİ GEREKLİ'}
                            </span>
                          </div>
                          
                          {parsedPresident.outcome && (
                            <div className="mt-4 border-t border-[var(--border-subtle)] pt-2.5 flex items-center justify-between">
                              <span className="text-[9px] text-[var(--text-muted)] font-black uppercase">GERÇEKLEŞEN SONUÇ:</span>
                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                                parsedPresident.outcome === 'correct'
                                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                  : 'bg-red-500/10 border-red-500/20 text-red-400'
                              }`}>
                                {parsedPresident.outcome === 'correct' ? 'İSABETLİ 👍' : 'YANILGI 👎'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Confidence Card */}
                        <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl p-4 flex flex-col justify-between">
                          <div>
                            <span className="text-[9px] font-black text-[var(--text-muted)] tracking-widest block uppercase">GÜVEN SKORU / CONFIDENCE</span>
                            <div className="flex items-center gap-4 mt-3">
                              <div className="relative flex items-center justify-center shrink-0">
                                <svg className="w-12 h-12 transform -rotate-90">
                                  <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="3" className="text-[var(--border-subtle)]" fill="transparent" />
                                  <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="3.5" className="text-[var(--accent)]" fill="transparent"
                                          strokeDasharray={`${2 * Math.PI * 20}`}
                                          strokeDashoffset={`${2 * Math.PI * 20 * (1 - parsedPresident.confidence / 100)}`} />
                                </svg>
                                <span className="absolute text-xs font-black text-[var(--text-primary)]">{parsedPresident.confidence}%</span>
                              </div>
                              <p className="text-[10px] text-[var(--text-muted)] leading-relaxed font-semibold">
                                Kurul üyelerinin departman analizleri ve hedefler üzerindeki oybirliği derecesi.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 4. Departman Yorumları (4 Ajanın Görüşleri) */}
                      <div className="space-y-2">
                        <span className="text-[9px] font-black text-[var(--text-muted)] tracking-widest block uppercase">DEPARTMAN DETAYLI GÖRÜŞLERİ</span>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] p-3 rounded-xl space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <Compass className="w-3.5 h-3.5 text-purple-400" />
                              <span className="text-[10px] font-black text-[var(--text-primary)] uppercase">Strateji Direktörü</span>
                            </div>
                            <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed select-text font-medium whitespace-pre-wrap">
                              {currentDebate.strategy_feedback || currentDebate.strategy_opinion || 'Görüş bildirilmedi.'}
                            </p>
                          </div>
                          
                          <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] p-3 rounded-xl space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <Shield className="w-3.5 h-3.5 text-amber-400" />
                              <span className="text-[10px] font-black text-[var(--text-primary)] uppercase">Risk & Uyum</span>
                            </div>
                            <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed select-text font-medium whitespace-pre-wrap">
                              {currentDebate.risk_feedback || currentDebate.risk_opinion || 'Görüş bildirilmedi.'}
                            </p>
                          </div>

                          <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] p-3 rounded-xl space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <Cog className="w-3.5 h-3.5 text-blue-400" />
                              <span className="text-[10px] font-black text-[var(--text-primary)] uppercase">Operasyon Şefi</span>
                            </div>
                            <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed select-text font-medium whitespace-pre-wrap">
                              {currentDebate.operations_feedback || currentDebate.operations_opinion || 'Görüş bildirilmedi.'}
                            </p>
                          </div>

                          <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] p-3 rounded-xl space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
                              <span className="text-[10px] font-black text-[var(--text-primary)] uppercase">Büyüme Direktörü</span>
                            </div>
                            <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed select-text font-medium whitespace-pre-wrap">
                              {currentDebate.growth_feedback || currentDebate.growth_opinion || 'Görüş bildirilmedi.'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* 5. Recommended Action */}
                      {parsedPresident.recommendedAction && (
                        <div className="bg-[var(--accent-muted)]/5 border border-[var(--accent)]/30 rounded-xl p-4">
                          <span className="text-[9px] font-black text-[var(--accent)] tracking-widest block uppercase mb-1.5">ÖNERİLEN STRATEJİK İLK ADIM</span>
                          <p className="text-xs text-[var(--text-primary)] font-bold flex items-start gap-1.5 leading-relaxed">
                            <ArrowRight className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                            {parsedPresident.recommendedAction}
                          </p>
                        </div>
                      )}

                      {/* 6. Three Column Lists: Risks, Required Data, Next Steps */}
                      <div className="grid grid-cols-3 gap-4">
                        {/* Risks */}
                        <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-2.5">
                          <span className="text-[9px] font-black text-rose-400 tracking-widest block uppercase border-b border-rose-500/20 pb-1.5 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> KRİTİK RİSKLER
                          </span>
                          <ul className="space-y-2 list-disc pl-4 text-[10px] text-[var(--text-secondary)] font-medium leading-relaxed">
                            {parsedPresident.risks.length > 0 ? (
                              parsedPresident.risks.map((r: string, idx: number) => (
                                <li key={idx} className="leading-relaxed">{r}</li>
                              ))
                            ) : (
                              <li className="text-[var(--text-muted)] italic list-none pl-0">Kritik bir risk veya teknik engel bulunamadı.</li>
                            )}
                          </ul>
                        </div>

                        {/* Required Data */}
                        <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-2.5">
                          <span className="text-[9px] font-black text-amber-400 tracking-widest block uppercase border-b border-amber-500/20 pb-1.5 flex items-center gap-1">
                            <Database className="w-3.5 h-3.5" /> GEREKEN EKSİK VERİ
                          </span>
                          <ul className="space-y-2 list-disc pl-4 text-[10px] text-[var(--text-secondary)] font-medium leading-relaxed">
                            {parsedPresident.requiredData.length > 0 ? (
                              parsedPresident.requiredData.map((d: string, idx: number) => (
                                <li key={idx} className="leading-relaxed">{d}</li>
                              ))
                            ) : (
                              <li className="text-[var(--text-muted)] italic list-none pl-0">Karar için tüm stratejik veriler mevcut.</li>
                            )}
                          </ul>
                        </div>

                        {/* Next Steps */}
                        <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-2.5">
                          <span className="text-[9px] font-black text-emerald-400 tracking-widest block uppercase border-b border-emerald-500/20 pb-1.5 flex items-center gap-1">
                            <CheckSquare className="w-3.5 h-3.5" /> EYLEM ADIMLARI
                          </span>
                          <ul className="space-y-2 list-decimal pl-4 text-[10px] text-[var(--text-secondary)] font-semibold leading-relaxed">
                            {parsedPresident.nextSteps.length > 0 ? (
                              parsedPresident.nextSteps.map((s: string, idx: number) => (
                                <li key={idx} className="leading-relaxed">{s}</li>
                              ))
                            ) : (
                              <li className="text-[var(--text-muted)] italic list-none pl-0">Eylem adımları planlanmadı.</li>
                            )}
                          </ul>
                        </div>
                      </div>

                      {/* 7. Chairman Detailed Synthesis Text */}
                      <div className="space-y-2">
                        <span className="text-[9px] font-black text-[var(--text-muted)] tracking-widest block uppercase">BAŞKAN'IN NİHAİ GEREKÇELİ ANALİZİ</span>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap select-text bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl p-4 font-medium italic">
                          {streamedText.president || parsedPresident.chairmanOpinion}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[var(--text-secondary)] font-medium space-y-4 whitespace-pre-wrap leading-relaxed select-text p-2">
                      {streamedText[activeAgent] ? (
                        streamedText[activeAgent]
                      ) : (
                        <p className="text-[var(--text-muted)] italic">Bu ajanın henüz görüş raporu oluşmadı.</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-20 text-center">
                  <HelpCircle className="w-10 h-10 mb-3 opacity-25 text-[var(--text-muted)]" />
                  <p className="text-xs text-[var(--text-muted)] font-bold">Herhangi bir tartışma konusu girilmemiş.</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">
                    Sol panelden bir taranmış KOBİ seçebilir veya kendi konunuzu belirleyip "Konseyi Topla" butonuna basabilirsiniz.
                  </p>
                </div>
              )}
            </div>

            {/* Debate Status & Actions Gate (Footer approval banner) */}
            {currentDebate && (
              <div className="border-t border-[var(--border-subtle)] pt-4 shrink-0 flex items-center justify-between bg-[var(--bg-surface)]">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-[var(--text-muted)] tracking-widest uppercase">
                    KONSENSÜS DURUMU:
                  </span>
                  <span className={`text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded border ${
                    currentDebate.status === 'approved'
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : currentDebate.status === 'vetoed'
                      ? 'text-red-400 bg-red-500/10 border-red-500/20'
                      : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                  }`}>
                    {currentDebate.status === 'approved' ? 'KURUL ONAYLADI' : currentDebate.status === 'vetoed' ? 'KURUL VETO ETTİ' : 'ORTAK KARAR BEKLENİYOR'}
                  </span>
                </div>

                {currentDebate.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDecision('vetoed')}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-4 py-2 border border-red-500/30 bg-red-500/5 hover:bg-red-500 hover:text-white rounded-lg text-xs font-black text-red-400 transition-all uppercase tracking-wider disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" /> VETO ET
                    </button>
                    <button
                      onClick={() => handleDecision('approved')}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-4 py-2 border border-emerald-500/30 bg-emerald-500/5 hover:bg-[var(--accent)] hover:text-black rounded-lg text-xs font-black text-[var(--accent)] transition-all uppercase tracking-wider disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" /> ONAYLA VE HEDEFE AL
                    </button>
                  </div>
                )}

                {currentDebate.status !== 'pending' && (
                  <div className="flex items-center justify-between flex-1 pl-6">
                    <div className="text-[10px] text-[var(--text-muted)] font-bold italic flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5" />
                      Bu tartışma {currentDebate.status === 'approved' ? 'onaylandı ve KOBİ CRM hedeflerine alındı.' : 'veto edilerek rafa kaldırıldı.'}
                    </div>

                    {/* Outcome feedback buttons */}
                    <div className="flex gap-2 items-center shrink-0 ml-4">
                      <span className="text-[9px] font-black text-[var(--text-muted)] tracking-wider uppercase">GERÇEKLEŞEN SONUÇ DOĞRU MU?</span>
                      <button
                        onClick={() => handleOutcome('correct')}
                        disabled={actionLoading}
                        className={`px-3 py-1 rounded border text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                          parsedPresident?.outcome === 'correct'
                            ? 'bg-emerald-500 text-black border-emerald-500'
                            : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500 hover:text-black'
                        }`}
                      >
                        DOĞRU 👍
                      </button>
                      <button
                        onClick={() => handleOutcome('incorrect')}
                        disabled={actionLoading}
                        className={`px-3 py-1 rounded border text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                          parsedPresident?.outcome === 'incorrect'
                            ? 'bg-red-500 text-white border-red-500'
                            : 'border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500 hover:text-white'
                        }`}
                      >
                        YANLIŞ 👎
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  )
}
