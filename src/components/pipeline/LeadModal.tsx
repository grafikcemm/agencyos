"use client"

import { useState } from 'react'
import { X, Sparkles, Building2, Copy, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export function LeadModal({ lead, onClose, onUpdate }: { lead: any, onClose: () => void, onUpdate: () => void }) {
  const [status, setStatus] = useState(lead.status || 'new')
  const [loading, setLoading] = useState(false)
  
  const handleSave = async () => {
    setLoading(true)
    await supabase.from('leads').update({ status }).eq('id', lead.id)
    setLoading(false)
    onUpdate()
    onClose()
  }

  const handleConvertToProject = async () => {
    setLoading(true)
    await supabase.from('projects').insert({
      lead_id: lead.id,
      business_name: lead.business_name,
      status: 'active',
      services: ['Yeni Proje'],
      setup_fee: 0,
      monthly_fee: 0
    })
    await supabase.from('leads').update({ status: 'converted' }).eq('id', lead.id)
    setLoading(false)
    onUpdate()
    onClose()
  }

  const handleCopySummary = () => {
    const services = lead.sector === 'güzellik salonu' || lead.sector === 'kuaför salonu' ?
      '• Sosyal Medya Şablonu\n• Logo Tasarımı\n• Instagram Yönetimi' :
      lead.sector === 'kafe' || lead.sector === 'kahve dükkanı' ?
      '• AI Görsel Üretimi\n• Sosyal Medya Yönetimi\n• Logo' :
      '• Logo & Kurumsal Kimlik\n• Sosyal Medya Şablonu'

    const estimatedValue = lead.potential_score >= 80 ? '8.000 - 15.000 ₺' :
      lead.potential_score >= 60 ? '5.000 - 10.000 ₺' :
      '3.000 - 6.000 ₺'

    const text = `🎯 YENİ LEAD — ${lead.priority === 'high' ? '⚡ YÜKSEK ÖNCELİK' : ''}

İşletme: ${lead.business_name}
Sektör: ${lead.sector || 'Belirtilmedi'}
Şehir: ${lead.city || 'Belirtilmedi'}
📞 ${lead.phone || 'Yok'}
⭐ Google: ${lead.rating || '?'}/5 (${lead.review_count || 0} yorum)

❌ Eksikler:
${!lead.has_website ? '• Web sitesi YOK\n' : ''}${lead.potential_score >= 80 ? '• Dijital görünürlük yetersiz\n' : ''}
💡 Önerilen Hizmetler:
${services}

💰 Tahmini Değer: ${estimatedValue}

📝 Not: ${lead.ai_analysis?.slice(0, 100) || 'Analiz bekleniyor'}`

    navigator.clipboard.writeText(text)
    alert("WhatsApp özeti kopyalandı!")
  }

  const handleAnalyze = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/leads/analyze', {
        method: 'POST',
        body: JSON.stringify({ lead_id: lead.id })
      })
      if (res.ok) {
        onUpdate()
        onClose() // veya lead objesini update et. Kolaylık olsun diye kapatıyoruz veya sadece onUpdate() çağırıyoruz. Kullanıcı onUpdate sonrasında kapatılıp açıldığında güncelini görür veya state güncelleriz.
        // Aslında onClose demeden state'te güncellemek daha iyi.
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm font-mono p-4">
      <div className="bg-[#0a0d16] border border-[var(--border-color)] w-full max-w-2xl rounded-sm p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-white">
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--border-color)]">
          <div className="w-10 h-10 rounded-sm bg-[var(--os-accent)]/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-[var(--os-accent)]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-wide">{lead.business_name}</h2>
            <div className="flex gap-2 text-xs text-[var(--text-secondary)] mt-1">
              <span>{lead.sector || 'Sektör Yok'}</span> • <span>{lead.city || 'Şehir Yok'}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] text-[var(--text-secondary)] font-bold tracking-widest mb-2">DURUMU GÜNCELLE</label>
              <select 
                className="w-full bg-[#050810] border border-[var(--border-color)] p-2 text-xs text-white outline-none focus:border-[var(--os-cyan)]"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="new">YENİ LEAD</option>
                <option value="contacted">İLETİŞİM KURULDU</option>
                <option value="responded">YANIT VERDİ</option>
                <option value="meeting">TOPLANTI</option>
                <option value="proposal">TEKLİF</option>
                <option value="converted">KAZANILDI</option>
              </select>
            </div>
            
            <div className="bg-[#050810] border border-[var(--border-color)] p-4 rounded-sm">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-[10px] text-[var(--os-cyan)] font-bold tracking-widest flex items-center gap-2">
                  <Sparkles className="w-3 h-3" /> AI ANALİZİ
                </h3>
                {!lead.ai_analysis && (
                  <button onClick={handleAnalyze} disabled={loading} className="text-[10px] bg-[var(--os-cyan)] text-[#050810] px-2 py-1 rounded-sm font-bold flex items-center gap-1 hover:bg-[#0891b2] transition-colors">
                    🔍 {loading ? 'ANALİZ EDİLİYOR...' : 'ANALİZ ET'}
                  </button>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {lead.ai_analysis || "Henüz analiz yapılmadı"}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-[var(--os-accent)]/5 border border-[var(--os-accent)]/20 p-4 rounded-sm h-full flex flex-col">
              <h3 className="text-[10px] text-[var(--os-accent)] font-bold tracking-widest mb-3">PİTCH ŞABLONU</h3>
              <p className="text-xs text-[var(--text-primary)] leading-relaxed flex-1 whitespace-pre-wrap italic opacity-90">
                "{lead.pitch || "Sayın yetkili, dijital varlığınızı güçlendirmek için size özel bir teklifimiz var."}"
              </p>
              <button 
                onClick={handleCopySummary}
                className="mt-4 flex items-center justify-center gap-2 w-full py-2 bg-[var(--bg-elevated)] hover:bg-[var(--bg-card)] border border-[var(--border-color)] text-[10px] font-bold tracking-wider rounded-sm transition-colors"
              >
                <Copy className="w-3 h-3" /> WHATSAPP İÇİN KOPYALA
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center pt-6 border-t border-[var(--border-color)]">
          <button className="text-[var(--os-red)] text-[11px] font-bold tracking-wider hover:underline flex items-center gap-1">
            <Trash2 className="w-3.5 h-3.5" /> SİL
          </button>
          
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-[var(--border-color)] text-[11px] font-bold tracking-wider hover:bg-[#050810]">
              İPTAL
            </button>
            <button onClick={handleConvertToProject} className="px-4 py-2 bg-[var(--os-green)] text-[#050810] text-[11px] font-bold tracking-wider hover:bg-green-400">
              PROJEYE DÖNÜŞTÜR
            </button>
            <button onClick={handleSave} disabled={loading} className="px-4 py-2 bg-[var(--os-cyan)] text-[#050810] text-[11px] font-bold tracking-wider hover:bg-[#0891b2]">
              {loading ? 'KAYDEDİLİYOR...' : 'KAYDET'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
