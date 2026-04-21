import { StatCard } from '@/components/os/StatCard'
import { StatusBadge } from '@/components/os/StatusBadge'
import { ArrowRight, Database, MapPin, Zap } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export const revalidate = 0 // Her zaman güncel veri

export default async function DashboardPage() {
  // Veritabanından verileri çek
  const { data: projects, error: projectsError } = await supabase.from('projects').select('*')
  const { count: pipelineCount, error: leadsError } = await supabase.from('leads').select('*', { count: 'exact', head: true })
  
  const activeProjects = projects?.filter(p => p.status === 'active')?.length || 0
  const monthlyRevenue = projects?.filter(p => p.status === 'active').reduce((acc, p) => acc + (p.monthly_fee || 0), 0) || 0

  // Entegrasyon durumları (basit .env kontrolü)
  const isSupabaseActive = !!process.env.NEXT_PUBLIC_SUPABASE_URL
  const isGeminiActive = !!process.env.GOOGLE_GEMINI_API_KEY
  const isMapsActive = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY

  return (
    <div className="p-8 max-w-7xl mx-auto font-mono space-y-8 animate-in fade-in duration-500">
      
      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard 
          abbr="PL" 
          title="AKTİF PROJELER" 
          value={activeProjects.toString()} 
          statusText={activeProjects > 0 ? "YÖNETİLİYOR" : "YOK"}
          statusVariant={activeProjects > 0 ? "cyan" : "warning"}
        />
        <StatCard 
          abbr="$" 
          title="AYLIK GELİR" 
          value={`₺${monthlyRevenue.toLocaleString('tr-TR')}`} 
          statusText={monthlyRevenue > 0 ? "BÜYÜYOR" : "GELİR YOK"}
          statusVariant={monthlyRevenue > 0 ? "cyan" : "warning"}
        />
        <StatCard 
          abbr="SYS" 
          title="DB BAĞLANTISI" 
          value={projectsError || leadsError ? "HATA" : "AKTİF"} 
          statusText={projectsError || leadsError ? "BAĞLANTI YOK" : "SİSTEM STABİL"}
          statusVariant={projectsError || leadsError ? "error" : "cyan"}
        />
        <StatCard 
          abbr="RT" 
          title="PİPELİNE" 
          value={pipelineCount?.toString() || "0"} 
          statusText={pipelineCount ? "UÇUŞTA" : "BOŞ"}
          statusVariant={pipelineCount ? "cyan" : "warning"}
        />
      </div>

      {/* Quick Start Guide */}
      <div className="os-card p-6">
        <div className="flex items-center gap-4 mb-6 relative">
          <h2 className="text-sm font-bold text-[var(--os-cyan)] tracking-widest">// HIZLI BAŞLANGIÇ // V0.1</h2>
          <div className="flex-1 h-[1px] bg-gradient-to-r from-[var(--border-bright)] to-transparent"></div>
        </div>
        
        <p className="text-[var(--text-secondary)] text-sm mb-8 tracking-wide">
          Lead bul → analiz et → pipeline'a ekle → proje aç.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Step 1 */}
          <div className="border border-[var(--border-color)] bg-[var(--bg-elevated)] p-5 rounded-sm relative group hover:border-[var(--os-cyan)] transition-colors">
            <div className="text-[10px] text-[var(--os-cyan)] font-bold tracking-widest mb-3">// ADIM-01</div>
            <h3 className="font-bold text-sm tracking-widest mb-6 h-10 uppercase">LEAD BUL VEYA OLUŞTUR</h3>
            <div className="flex gap-3">
              <Link href="/map" className="px-4 py-2 bg-[var(--os-accent)] text-[#050810] text-[11px] font-bold tracking-wider hover:bg-[var(--os-accent-hover)] transition-colors">
                + TARA
              </Link>
            </div>
          </div>

          {/* Step 2 */}
          <div className="border border-[var(--border-color)] bg-[var(--bg-elevated)] p-5 rounded-sm relative group hover:border-[var(--os-cyan)] transition-colors">
            <div className="text-[10px] text-[var(--os-cyan)] font-bold tracking-widest mb-3">// ADIM-02</div>
            <h3 className="font-bold text-sm tracking-widest mb-4 uppercase">ANALİZ ET</h3>
            <p className="text-[11px] text-[var(--text-secondary)] mb-6 h-8">Gemini ile işletmeleri otomatik analiz edip pitch metinleri oluştur.</p>
            <Link href="/map" className="px-4 py-2 border border-[var(--border-bright)] text-[11px] font-bold tracking-wider hover:bg-[var(--bg-card)] transition-colors bg-black/40 inline-block">
              ANALİZ BAŞLAT
            </Link>
          </div>

          {/* Step 3 */}
          <div className="border border-[var(--border-color)] bg-[var(--bg-elevated)] p-5 rounded-sm relative group hover:border-[var(--os-cyan)] transition-colors">
            <div className="flex justify-between items-start mb-3">
              <div className="text-[10px] text-[var(--os-cyan)] font-bold tracking-widest">// ADIM-03</div>
              <div className="text-[var(--text-muted)] group-hover:text-[var(--os-cyan)] transition-colors">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
            <h3 className="font-bold text-sm tracking-widest mb-4 uppercase">PİPELİNE'A EKLE</h3>
            <p className="text-[11px] text-[var(--text-secondary)] mb-6 h-8">Lead'i CRM'e taşı ve durumunu takip et.</p>
            <div className="flex gap-3 items-center">
              <Link href="/pipeline" className="px-4 py-2 bg-[var(--os-accent)] text-[#050810] text-[11px] font-bold tracking-wider hover:bg-[var(--os-accent-hover)] transition-colors flex items-center gap-2">
                PİPELİNE AÇ
              </Link>
              <span className="text-[10px] text-[var(--text-muted)] font-bold">HIZLI</span>
            </div>
          </div>
        </div>
      </div>

      {/* Integration Status */}
      <div className="os-card p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4 relative">
            <h2 className="text-sm font-bold text-[var(--os-accent)] tracking-widest">// ENTEGRASYON DURUMU</h2>
          </div>
          <Link href="/settings" className="text-[10px] text-[var(--os-accent)] tracking-widest hover:underline hover:underline-offset-4">AYARLAR</Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 border border-[var(--border-color)] rounded-sm overflow-hidden">
          
          <div className="p-4 bg-[var(--bg-elevated)] border-r border-b md:border-b-0 border-[var(--border-color)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="text-[11px] font-bold tracking-widest uppercase">GEMİNİ</span>
            </div>
            <StatusBadge text={isGeminiActive ? "AKTİF" : "KAPALI"} variant={isGeminiActive ? "cyan" : "error"} />
          </div>

          <div className="p-4 bg-[var(--bg-elevated)] border-r border-b md:border-b-0 border-[var(--border-color)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="text-[11px] font-bold tracking-widest uppercase">SUPABASE</span>
            </div>
            <StatusBadge text={isSupabaseActive ? "AKTİF" : "KAPALI"} variant={isSupabaseActive ? "cyan" : "error"} />
          </div>

          <div className="p-4 bg-[var(--bg-elevated)] border-r border-b md:border-b-0 border-[var(--border-color)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="text-[11px] font-bold tracking-widest uppercase">GOOGLE MAPS</span>
            </div>
            <StatusBadge text={isMapsActive ? "AKTİF" : "KAPALI"} variant={isMapsActive ? "cyan" : "error"} />
          </div>

          <div className="p-4 bg-[var(--bg-elevated)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-[2px] bg-[var(--text-muted)] flex items-center justify-center text-[#050810] text-[8px] font-bold">OS</div>
              <span className="text-[11px] font-bold tracking-widest uppercase">SİSTEM</span>
            </div>
            <StatusBadge text="ÇEVRİMİÇİ" variant="cyan" pulse />
          </div>

        </div>
      </div>

    </div>
  )
}
