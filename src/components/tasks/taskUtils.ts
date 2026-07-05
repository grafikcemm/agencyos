import type { ActiveTask } from '@/types/tasks'

// Görev sıralaması — loader'daki sortActiveTasks ile AYNI mantık
// (aktif → bekleyen, öncelik önde, sonra sort_order). Optimistik yeniden
// sıralama sunucuyla birebir eşleşsin diye burada da aynısı uygulanır.
export function sortTasks(tasks: ActiveTask[]): ActiveTask[] {
  return [...tasks].sort((a, b) => {
    if (a.category !== b.category) return a.category === 'active' ? -1 : 1
    if (!!a.is_priority !== !!b.is_priority) return a.is_priority ? -1 : 1
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })
}

export type DueState = 'overdue' | 'today' | 'upcoming' | 'none'

export interface DueMeta {
  state: DueState
  label: string
}

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

// yyyy-MM-dd → "12 Tem" kısa TR etiketi (deterministik, timezone bağımsız).
export function formatDue(due: string): string {
  const [y, m, d] = due.split('-').map(Number)
  if (!y || !m || !d) return due
  return `${d} ${TR_MONTHS[m - 1] ?? ''}`.trim()
}

// Görevin son-tarih durumu. `todayStr` sunucudan gelen yyyy-MM-dd (İstanbul
// günü) — client Date'i kullanılmaz ki gün sınırı kaymasın. Tamamlanmış
// görevde tarih vurgusu gösterilmez. yyyy-MM-dd string'leri kronolojik
// sıralandığı için düz string karşılaştırması güvenli.
export function dueMeta(task: ActiveTask, todayStr: string): DueMeta {
  const due = task.due_date
  if (!due || task.is_done) return { state: 'none', label: '' }
  if (due < todayStr) return { state: 'overdue', label: 'Gecikti' }
  if (due === todayStr) return { state: 'today', label: 'Bugün' }
  return { state: 'upcoming', label: formatDue(due) }
}

export interface StepProgress {
  done: number
  total: number
  nextTitle: string | null
}

// Alt-adım ilerlemesi + "sıradaki tek adım" (ilk yapılmamış adımın başlığı).
export function stepProgress(task: ActiveTask): StepProgress {
  const steps = task.steps ?? []
  const done = steps.filter((s) => s.is_done).length
  const next = steps.find((s) => !s.is_done)
  return { done, total: steps.length, nextTitle: next?.title ?? null }
}
