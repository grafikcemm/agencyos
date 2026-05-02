import { Search, MoreVertical } from 'lucide-react'
import { NewProjectModal } from '@/components/os/NewProjectModal'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/Badge'

export const revalidate = 0

export default async function ProjectsPage() {
  const { data: projects } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
  const projectList = projects || []

  const activeProjects = projectList.filter((p: any) => p.status === 'active').length
  const totalRevenue = projectList.reduce((sum: number, p: any) => sum + Number(p.revenue_tl || p.monthly_fee || 0), 0)

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">Proje Takibi</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Aktif projeler ve gelir takibi</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Proje ara..."
                className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs py-2 pl-9 pr-3 outline-none focus:border-[var(--border-highlight)] transition-all w-52"
              />
            </div>
            <NewProjectModal />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Aktif Proje', value: activeProjects },
            { label: 'Toplam Proje', value: projectList.length },
            { label: 'Toplam Değer', value: `₺${totalRevenue.toLocaleString('tr-TR')}`, accent: true },
          ].map(stat => (
            <div key={stat.label} className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1.5">{stat.label}</div>
              <div className={`text-xl font-bold ${stat.accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                {['İşletme', 'Durum', 'Hizmetler', 'Gelir', 'Tahsilat', ''].map(h => (
                  <th key={h} className="py-3 px-5 text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {projectList.map((p: any) => (
                <tr key={p.id} className="hover:bg-[var(--bg-base)]/50 transition-colors group">
                  <td className="py-3.5 px-5">
                    <div className="font-medium text-[var(--text-primary)] text-sm">{p.business_name}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{new Date(p.created_at).toLocaleDateString('tr-TR')}</div>
                  </td>
                  <td className="py-3.5 px-5">
                    <Badge variant={p.status === 'active' ? 'success' : 'muted'}>{p.status}</Badge>
                  </td>
                  <td className="py-3.5 px-5">
                    <div className="flex flex-wrap gap-1">
                      {p.services?.map((s: string, i: number) => (
                        <span key={i} className="text-[10px] bg-[var(--bg-base)] border border-[var(--border-subtle)] px-2 py-0.5 rounded text-[var(--text-muted)]">
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3.5 px-5">
                    <span className="font-semibold text-[var(--text-primary)] text-sm">
                      ₺{(p.revenue_tl || p.monthly_fee || 0).toLocaleString('tr-TR')}
                    </span>
                  </td>
                  <td className="py-3.5 px-5">
                    <Badge variant={p.revenue_collected ? 'success' : 'warning'}>
                      {p.revenue_collected ? 'Ödendi' : 'Bekliyor'}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-5 text-right">
                    <button className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)] transition-all opacity-0 group-hover:opacity-100">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {projectList.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-[var(--text-muted)] text-sm">
                    Henüz kayıtlı proje bulunmuyor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
