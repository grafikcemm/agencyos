import { EyeOff } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto font-mono">
      
      <div className="mb-8">
        <h2 className="text-xl font-bold tracking-widest uppercase mb-1">Sistem Ayarları</h2>
        <p className="text-xs text-[var(--text-secondary)]">Ajans bilgileri, API anahtarları ve entegrasyonlar</p>
      </div>

      <div className="space-y-6">
        
        {/* AJANS BİLGİLERİ */}
        <div className="os-card p-6">
          <h3 className="text-sm font-bold text-[var(--os-accent)] tracking-widest mb-6 uppercase">// AJANS BİLGİLERİ</h3>
          
          <div className="space-y-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-xs text-[var(--text-secondary)] font-bold tracking-wide">Ajans Adı</label>
              <input type="text" defaultValue="GrafikCem Studio" className="col-span-3 bg-[#050810] border border-[var(--border-color)] rounded-sm text-xs p-2 text-[var(--text-primary)] outline-none focus:border-[var(--os-accent)]" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-xs text-[var(--text-secondary)] font-bold tracking-wide">E-posta</label>
              <input type="email" defaultValue="info@grafikcem.com" className="col-span-3 bg-[#050810] border border-[var(--border-color)] rounded-sm text-xs p-2 text-[var(--text-primary)] outline-none focus:border-[var(--os-accent)]" />
            </div>
            
            <div className="flex justify-end pt-2">
              <button className="px-4 py-2 border border-[var(--border-bright)] text-xs font-bold tracking-wider hover:bg-[#050810] transition-colors rounded-sm uppercase">Bilgileri Kaydet</button>
            </div>
          </div>
        </div>

        {/* API ANAHTARLARI */}
        <div className="os-card p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[var(--os-cyan)]"></div>
          
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-bold text-[var(--os-cyan)] tracking-widest uppercase">// API ANAHTARLARI</h3>
          </div>
          
          <div className="space-y-6">
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-xs font-bold tracking-wide text-[var(--text-primary)] flex items-center gap-2">
                  Google Maps API Key
                  <span className="text-[9px] px-1.5 py-0.5 bg-[var(--os-green)]/10 text-[var(--os-green)] border border-[var(--os-green)]/30 rounded-sm">AKTİF</span>
                </label>
              </div>
              <div className="relative">
                <input type="password" defaultValue="AIzaSyA-dummy-key" className="w-full bg-[#050810] border border-[var(--border-color)] rounded-sm text-xs p-2.5 text-[var(--text-muted)] outline-none pr-10" disabled />
                <button className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <EyeOff className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-xs font-bold tracking-wide text-[var(--text-primary)] flex items-center gap-2">
                  Gemini API Key
                  <span className="text-[9px] px-1.5 py-0.5 bg-[var(--os-green)]/10 text-[var(--os-green)] border border-[var(--os-green)]/30 rounded-sm">AKTİF</span>
                </label>
              </div>
              <div className="relative">
                <input type="password" defaultValue="AIzaSyA-dummy-key" className="w-full bg-[#050810] border border-[var(--border-color)] rounded-sm text-xs p-2.5 text-[var(--text-muted)] outline-none pr-10" disabled />
                <button className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <EyeOff className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--border-color)] flex justify-between items-center">
               <span className="text-[10px] text-[var(--text-muted)] tracking-wider">Değiştirmek için .env.local dosyasını güncelleyiniz.</span>
               <button className="px-4 py-2 bg-[var(--os-cyan)] text-[#050810] text-xs font-bold tracking-wider hover:bg-[#0891b2] transition-colors rounded-sm uppercase">BAĞLANTILARI TEST ET</button>
            </div>

          </div>
        </div>

        {/* SİSTEM DURUMU */}
        <div className="os-card p-6">
          <h3 className="text-sm font-bold text-[var(--text-muted)] tracking-widest mb-6 uppercase">// SİSTEM LOGLARI</h3>
          
          <div className="bg-[#050810] border border-[var(--border-color)] p-4 text-[10px] text-[var(--text-secondary)] space-y-2 rounded-sm h-32 overflow-y-auto">
            <div><span className="text-[var(--os-green)]">[OK]</span> 14:02:45 — Supabase veritabanı bağlantısı başarılı.</div>
            <div><span className="text-[var(--os-green)]">[OK]</span> 14:02:46 — Gemini API Auth doğrulandı.</div>
            <div><span className="text-[var(--os-cyan)]">[NFO]</span> 14:05:12 — Cron /daily-scan tetiklendi (0 lead bulundu).</div>
            <div><span className="text-[var(--os-accent)]">[WRN]</span> 14:10:05 — N8N webhook kapalı.</div>
          </div>
        </div>

      </div>
    </div>
  )
}
