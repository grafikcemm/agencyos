/**
 * Lead/Map result-table column metadata.
 *
 * Pure UI configuration for the configurable result-table columns on the
 * lead/map page. Contains types + constants ONLY — no rendering logic
 * (that lives in the page component).
 *
 * Consumed by src/app/(os)/harita/page.tsx for the column toggle menu and
 * the dynamic table render.
 */

export type LeadColumnKey =
  | 'priority'
  | 'business_name'
  | 'sector'
  | 'location'
  | 'phone'
  | 'website'
  | 'email'
  | 'rating'
  | 'score'
  | 'service'
  | 'tier'
  | 'value'
  | 'source'
  | 'actions'

export interface LeadColumnDef {
  /** Stable identifier for the column. */
  key: LeadColumnKey
  /** Turkish header label shown in the table and toggle menu. */
  label: string
  /** Cell/header text alignment. Defaults to 'left' when omitted. */
  align?: 'left' | 'center' | 'right'
  /** When true, the column is always visible and cannot be hidden. */
  alwaysOn?: boolean
}

/**
 * Every column definition, in display order.
 * Order: priority, business_name, sector, location, phone, website, email,
 * rating, score, service, tier, value, actions.
 */
export const LEAD_COLUMNS: LeadColumnDef[] = [
  { key: 'priority', label: 'Öncelik', align: 'left' },
  { key: 'business_name', label: 'İşletme', align: 'left', alwaysOn: true },
  { key: 'sector', label: 'Sektör', align: 'left' },
  { key: 'location', label: 'Şehir/İlçe', align: 'left' },
  { key: 'phone', label: 'Telefon', align: 'left' },
  { key: 'website', label: 'Web', align: 'left' },
  { key: 'email', label: 'E-posta', align: 'left' },
  { key: 'rating', label: 'Puan', align: 'right' },
  { key: 'score', label: 'Skor', align: 'right' },
  { key: 'service', label: 'Hizmet', align: 'left' },
  { key: 'tier', label: 'Tier', align: 'center' },
  { key: 'value', label: 'Tahmini Değer', align: 'right' },
  { key: 'source', label: 'Kaynak', align: 'left' },
  { key: 'actions', label: 'Aksiyonlar', align: 'right', alwaysOn: true },
]

/**
 * The default set of visible columns, in display order.
 * These are the 8 columns currently shown by default on the lead/map page.
 */
export const DEFAULT_VISIBLE: LeadColumnKey[] = [
  'priority',
  'business_name',
  'sector',
  'location',
  'score',
  'service',
  'value',
  'actions',
]

/** localStorage key used to persist the user's visible-column selection. */
export const COLUMN_STORAGE_KEY = 'haritaLeadColumns'
