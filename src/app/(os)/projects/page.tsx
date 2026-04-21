import { Search } from 'lucide-react'
import { NewProjectModal } from '@/components/os/NewProjectModal'
import { supabase } from '@/lib/supabase'

export const revalidate = 0

export default async function ProjectsPage() {
  const { data: projects } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
  const projectList = projects || []
  
  const totalProjects = projectList.length
  const activeProjects = projectList.filter(p => p.status === 'active').length
  const monthlyRevenue = projectList.filter(p => p.status === 'active').reduce((sum, p) => sum + Number(p.monthly_fee || 0), 0)
  const totalSetup = projectList.reduce((sum, p) => sum + Number(p.setup_fee || 0), 0)

  return (
    <div className="p-8 max-w-7xl mx-auto font-mono">
      
      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="os-card p-4">
          <div className="text-[10px] text-[var(--text-secondary)] font-bold tracking-widest mb-2">TOPLAM PROJE</div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">{totalProjects}</div>
        </div>
        <div className="os-card p-4">
          <div className="text-[10px] text-[var(--text-secondary)] font-bold tracking-widest mb-2">AKTİF PROJELER</div>
          <div className="text-2xl font-bold text-[var(--os-green)]">{activeProjects}</div>
        </div>
        <div className="os-card p-4">
          <div className="text-[10px] text-[var(--text-secondary)] font-bold tracking-widest mb-2">AYLIK GELİR</div>
          <div className="text-2xl font-bold text-[var(--os-accent)]">₺{monthlyRevenue.toLocaleString('tr-TR')}</div>
        </div>
        <div className="os-card p-4">
          <div className="text-[10px] text-[var(--text-secondary)] font-bold tracking-widest mb-2">KURULUM (BİRİKMİŞ)</div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">₺{totalSetup.toLocaleString('tr-TR')}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex justify-between items-center mb-4">
        <div className="relative w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input 
            type="text" 
            placeholder="Proje ara..." 
            className="w-full bg-[#0a0d16] border border-[var(--border-color)] rounded-sm text-xs py-2 pl-9 pr-3 outline-none focus:border-[var(--os-cyan)] transition-colors"
          />
        </div>
        <NewProjectModal />
      </div>

      {/* Projects Table */}
      <div className="border border-[var(--border-color)] bg-[#0a0d16] rounded-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-color)] bg-[#050810]/50">
              <th className="py-3 px-4 text-[10px] font-bold tracking-widest text-[var(--text-secondary)]">İŞLETME</th>
              <th className="py-3 px-4 text-[10px] font-bold tracking-widest text-[var(--text-secondary)]">DURUM</th>
              <th className="py-3 px-4 text-[10px] font-bold tracking-widest text-[var(--text-secondary)]">HİZMETLER</th>
              <th className="py-3 px-4 text-[10px] font-bold tracking-widest text-[var(--text-secondary)]">KURULUM</th>
              <th className="py-3 px-4 text-[10px] font-bold tracking-widest text-[var(--text-secondary)]">AYLIK</th>
              <th className="py-3 px-4 text-[10px] font-bold tracking-widest text-[var(--text-secondary)]">BAŞLANGIÇ</th>
              <th className="py-3 px-4 text-[10px] font-bold tracking-widest text-[var(--text-secondary)] text-right">İŞLEMLER</th>
            </tr>
          </thead>
          <tbody className="text-xs">
            {projectList.map(p => (
              <tr key={p.id} className="border-b border-[var(--border-color)] hover:bg-[#050810] transition-colors group">
                <td className="py-4 px-4 font-bold text-[var(--text-primary)]">{p.business_name}</td>
                <td className="py-4 px-4">
                  <span className={`px-2 py-0.5 rounded-sm text-[9px] font-bold tracking-wider border ${
                    p.status === 'active' ? 'border-[var(--os-green)] text-[var(--os-green)]' 
                    : 'border-[var(--text-muted)] text-[var(--text-secondary)]'
                  }`}>
                    {p.status.toUpperCase()}
                  </span>
                </td>
                <td className="py-4 px-4 text-[var(--text-secondary)]">
                  {p.services ? p.services.join(', ') : ''}
                </td>
                <td className="py-4 px-4">₺{Number(p.setup_fee || 0).toLocaleString('tr-TR')}</td>
                <td className="py-4 px-4 text-[var(--os-accent)] font-bold">₺{Number(p.monthly_fee || 0).toLocaleString('tr-TR')}</td>
                <td className="py-4 px-4 text-[var(--text-secondary)]">{new Date(p.created_at).toLocaleDateString('tr-TR')}</td>
                <td className="py-4 px-4 text-right">
                  <button className="text-[var(--text-muted)] group-hover:text-[var(--os-cyan)] text-[10px] font-bold tracking-widest transition-colors uppercase">
                    Düzenle
                  </button>
                </td>
              </tr>
            ))}
            {projectList.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[var(--text-muted)] text-xs">Henüz proje bulunmuyor.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  )
}
