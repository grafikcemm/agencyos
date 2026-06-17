import { Check } from "lucide-react"

export function FilterPanel() {
  return (
    <div className="absolute top-16 left-6 z-[400] w-64">
      <div className="os-card bg-[var(--bg-surface)]/90 backdrop-blur-md p-4 space-y-5">
        
        <h3 className="text-[10px] text-[var(--os-cyan)] font-bold tracking-widest uppercase">{"// FİLTRE"}</h3>
        
        {/* Şehir Seçimi Placeholder */}
        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--text-secondary)] font-bold tracking-widest">ŞEHİR</label>
          <select className="w-full bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-sm text-xs p-2 text-[var(--text-primary)] outline-none focus:border-[var(--os-cyan)]">
            <option>Tüm Şehirler</option>
            <option>İstanbul</option>
            <option>Ankara</option>
            <option>İzmir</option>
          </select>
        </div>

        {/* Niş Seçimi Placeholder */}
        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--text-secondary)] font-bold tracking-widest">NİŞ</label>
          <select className="w-full bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-sm text-xs p-2 text-[var(--text-primary)] outline-none focus:border-[var(--os-cyan)]">
            <option>Tüm Sektörler</option>
            <option>Güzellik Salonu</option>
            <option>Restoran</option>
            <option>Emlak Ofisi</option>
          </select>
        </div>

        {/* Durum Checkbox'ları */}
        <div className="space-y-2.5">
          <label className="text-[10px] text-[var(--text-secondary)] font-bold tracking-widest">DURUM</label>
          
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="w-3.5 h-3.5 border border-[var(--os-cyan)] bg-[var(--os-cyan)] rounded-sm flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-[#050810]" />
              </div>
              <span className="text-[11px] font-bold tracking-wider text-[var(--text-primary)]">NEW</span>
              <div className="w-2 h-2 rounded-full bg-[var(--os-cyan)] ml-auto"></div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="w-3.5 h-3.5 border border-[var(--os-accent)] bg-[var(--os-accent)] rounded-sm flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-[#050810]" />
              </div>
              <span className="text-[11px] font-bold tracking-wider text-[var(--text-primary)]">CONTACTED</span>
              <div className="w-2 h-2 rounded-full bg-[var(--os-accent)] ml-auto"></div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="w-3.5 h-3.5 border border-[var(--os-green)] bg-[var(--os-green)] rounded-sm flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-[#050810]" />
              </div>
              <span className="text-[11px] font-bold tracking-wider text-[var(--text-primary)]">CONVERTED</span>
              <div className="w-2 h-2 rounded-full bg-[var(--os-green)] ml-auto"></div>
            </label>
            
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="w-3.5 h-3.5 border border-[var(--os-red)] bg-[var(--bg-base)] rounded-sm flex items-center justify-center">
                {/* Unchecked */}
              </div>
              <span className="text-[11px] font-bold tracking-wider text-[var(--text-secondary)]">LOST</span>
              <div className="w-2 h-2 rounded-full bg-[var(--os-red)] ml-auto opacity-50"></div>
            </label>
          </div>
        </div>

      </div>
    </div>
  )
}
