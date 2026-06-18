/**
 * person_leads (kişi/pozisyon lead) sonuç tablosu kolon metadata'sı.
 * leadColumns.ts'in kişi karşılığı — harita "People" sekmesi tablosu kullanır.
 * Saf UI yapılandırması; render mantığı harita sayfasında.
 */

export type PersonColumnKey =
  | 'priority'
  | 'full_name'
  | 'title'
  | 'seniority'
  | 'company'
  | 'location'
  | 'linkedin'
  | 'email'
  | 'difficulty'
  | 'market'
  | 'earning'
  | 'person_score'
  | 'value'
  | 'source'
  | 'actions'

export interface PersonColumnDef {
  key: PersonColumnKey
  label: string
  align?: 'left' | 'center' | 'right'
  alwaysOn?: boolean
}

export const PERSON_COLUMNS: PersonColumnDef[] = [
  { key: 'priority', label: 'Tier', align: 'center' },
  { key: 'full_name', label: 'İsim', align: 'left', alwaysOn: true },
  { key: 'title', label: 'Pozisyon', align: 'left' },
  { key: 'seniority', label: 'Kıdem', align: 'left' },
  { key: 'company', label: 'Şirket', align: 'left' },
  { key: 'location', label: 'Şehir/Ülke', align: 'left' },
  { key: 'linkedin', label: 'LinkedIn', align: 'left' },
  { key: 'email', label: 'E-posta', align: 'left' },
  { key: 'difficulty', label: 'Kolaylık', align: 'right' },
  { key: 'market', label: 'Market', align: 'right' },
  { key: 'earning', label: 'Kazanç', align: 'right' },
  { key: 'person_score', label: 'Skor', align: 'right' },
  { key: 'value', label: 'Aylık ₺', align: 'right' },
  { key: 'source', label: 'Kaynak', align: 'left' },
  { key: 'actions', label: 'Aksiyon', align: 'right', alwaysOn: true },
]

/** Varsayılan görünür kolonlar (CSV benzeri zengin görünüm). */
export const PERSON_DEFAULT_VISIBLE: PersonColumnKey[] = [
  'priority',
  'full_name',
  'title',
  'company',
  'difficulty',
  'market',
  'earning',
  'person_score',
  'value',
  'actions',
]

export const PERSON_COLUMN_STORAGE_KEY = 'haritaPersonColumns'
