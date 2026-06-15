export interface TaskTemplate {
  id: string
  title: string
  section: 'kritik' | 'x_post' | 'sistem'
  category: 'discipline' | 'health'
  time_of_day: 'morning' | 'day' | 'evening'
  points: number
  system_type: 'vitamin' | 'skincare' | 'treadmill' | 'english' | 'x_post' | null
  sort_order: number
}

export interface DailyCompletion {
  id: string
  template_id: string
  date: string
}

export interface ActiveTask {
  id: string
  title: string
  is_done: boolean
  category: 'active' | 'waiting'
  sort_order: number
  is_priority?: boolean
  created_at: string
  note?: string
  /** Detay ekranında düzenlenen serbest açıklama (görevi netleştirir). */
  description?: string
  /** Opsiyonel son tarih (yyyy-MM-dd). */
  due_date?: string
  steps?: ActiveTaskStep[]
}

// Büyük/belirsiz hedef park edilemez: görev sıradaki somut adımlara bölünür.
export interface ActiveTaskStep {
  id: string
  task_id: string
  title: string
  is_done: boolean
  sort_order: number
  created_at: string
}
