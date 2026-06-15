import { Search, MoreVertical, TrendingUp, Wallet, AlertTriangle, Clock, Briefcase, ChevronUp } from 'lucide-react'
import { NewProjectModal } from '@/components/os/NewProjectModal'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'

export const revalidate = 0

function formatTL(n: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0)
}

function getRiskLevel(p: any): 'low' | 'medium' | 'high' {
  const dueDate = p.due_date ? new Date(p.due_date) : null
  const now = new Date()
  if (!p.revenue_collected && dueDate && dueDate < now) return 'high'
  if (p.status === 'pending' && p.created_at) {
    const ageDays = (now.getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24)
    if (ageDays > 30) return 'medium'
  }
  return 'low'
}

const RISK_COLORS = { low: 'var(--success)', medium: 'var(--warning)', high: 'var(--danger)' }

function nextActionFor(p: any): string {
  if (p.status === 'completed') return 'Upsell fırsatı kontrol et'
  if (!p.revenue_collected) return 'Tahsilat takibi gerekli'
  if (p.status === 'pending') return 'Kickoff toplantısı planla'
  if (p.status === 'active') return 'Haftalık ilerleme raporu hazırla'
  return 'Durum incelemesi gerekli'
}

export default async function ProjectsPage() {
  const { data: projects } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
  const projectList = projects || []

  const activeProjects = projectList.filter((p: any) => p.status === 'active').length
  const totalMRR = projectList
    .filter((p: any) => p.status === 'active')
    .reduce((sum: number, p: any) => sum + Number(p.monthly_fee || 0), 0)
  const pendingPayment = projectList
    .filter((p: any) => !p.revenue_collected)
    .reduce((sum: number, p: any) => sum + Number(p.revenue_tl || p.monthly_fee || 0), 0)
  const overduePayment = projectList
    .filter((p: any) => {
      if (p.revenue_collected) return false
      const due = p.due_date ? new Date(p.due_date) : null
      return due && due < new Date()
    })
    .reduce((sum: number, p: any) => sum + Number(p.revenue_tl || p.monthly_fee || 0), 0)

  const now = new Date()
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const dueThisMonth = projectList.filter((p: any) => {
    if (!p.due_date) return false
    const d = new Date(p.due_date)
    return d >= now && d <= endOfMonth
  }).length

  const upsellCandidates = projectList.filter((p: any) =>
    p.status === 'active' && p.revenue_collected && (!p.upsell_suggested)
  ).length

  return (
    <div className="h-full overflow-y-auto p-6 scrollbar-thin">
      <div className="space-y-5">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)]">Proje Takibi</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Gelir, tahsilat, teslimat ve upsell yönetimi</p>
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

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatCard icon={Briefcase} label="Aktif proje" value={String(activeProjects)} color="#5ac8fa" />
          <StatCard icon={Wallet} label="Toplam MRR" value={formatTL(totalMRR)} color="#5ee6b0" accent />
          <StatCard icon={Clock} label="Bekleyen tahsilat" value={formatTL(pendingPayment)} color="#e5b567" />
          <StatCard icon={AlertTriangle} label="Geciken ödeme" value={formatTL(overduePayment)} color="#f2555a" />
          <StatCard icon={TrendingUp} label="Bu ay teslim" value={String(dueThisMonth)} color="#8b5cf6" />
          <StatCard icon={ChevronUp} label="Upsell fırsatı" value={String(upsellCandidates)} color="#5ee6b0" />
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Aktif & Geçmiş Projeler</h3>
            <span className="text-[10px] text-[var(--text-muted)]">{projectList.length} proje</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {['Müşteri', 'Durum', 'Hizmetler', 'Kurulum', 'Aylık', 'Tahsilat', 'Risk', 'Sonraki Aksiyon'].map(h => (
                    <th key={h} className="py-3 px-4 text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{h}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {projectList.map((p: any) => {
                  const risk = getRiskLevel(p)
                  const action = nextActionFor(p)
                  const dueDate = p.due_date ? new Date(p.due_date) : null
                  return (
                    <tr key={p.id} className="hover:bg-[var(--bg-base)]/50 transition-colors group">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[var(--text-primary)] text-xs">{p.business_name}</div>
                        <div className="text-[9px] text-[var(--text-muted)] mt-0.5">
                          {new Date(p.created_at).toLocaleDateString('tr-TR')}
                          {dueDate && <span className="ml-2">→ {dueDate.toLocaleDateString('tr-TR')}</span>}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant={p.status === 'active' ? 'success' : p.status === 'pending' ? 'warning' : 'muted'}>{p.status}</Badge>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {Array.isArray(p.services) ? p.services.slice(0, 2).map((s: string, i: number) => (
                            <span key={i} className="text-[9px] bg-[var(--bg-base)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded text-[var(--text-secondary)]">{s}</span>
                          )) : <span className="text-[10px] text-[var(--text-muted)]">—</span>}
                          {Array.isArray(p.services) && p.services.length > 2 && (
                            <span className="text-[9px] text-[var(--text-muted)]">+{p.services.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-[11px] text-[var(--text-secondary)] lira">{formatTL(Number(p.setup_fee) || 0)}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-[11px] font-bold text-[var(--accent)] lira">{formatTL(Number(p.monthly_fee) || Number(p.revenue_tl) || 0)}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant={p.revenue_collected ? 'success' : 'warning'}>{p.revenue_collected ? 'Ödendi' : 'Bekliyor'}</Badge>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: RISK_COLORS[risk] }} />
                          <span className="text-[10px] capitalize text-[var(--text-secondary)]">{risk === 'low' ? 'düşük' : risk === 'medium' ? 'orta' : 'yüksek'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-[10px] text-[var(--text-secondary)]">{action}</span>
                      </td>
                      <td className="py-3.5 px-2 text-right">
                        <button className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-base)] transition-all opacity-0 group-hover:opacity-100">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {projectList.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-16 text-center">
                      <div className="text-sm text-[var(--text-muted)] mb-2">Henüz kayıtlı proje bulunmuyor</div>
                      <div className="text-[10px] text-[var(--text-muted)]">Kazanılan bir lead&apos;i Pipeline&apos;dan projeye dönüştürerek başlayabilirsin.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, accent }: { icon: any; label: string; value: string; color: string; accent?: boolean }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] truncate">{label}</div>
        <div className={`num text-sm font-black truncate ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</div>
      </div>
    </div>
  )
}
