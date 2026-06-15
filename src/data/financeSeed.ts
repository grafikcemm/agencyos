// Haziran 2025 başlangıç finans verileri (sabit referans)

export const HAZIRAN_INCOME_ITEMS = [
  { id: 'maas', title: 'Maaş', amount: 42000, type: 'fixed' },
  { id: 'freelance', title: 'Freelance kalan ödeme', amount: 16500, type: 'extra' },
] as const

export const HAZIRAN_TOTAL_INCOME = 58500
export const HAZIRAN_TOTAL_EXPENSE = 72878
export const HAZIRAN_NET = HAZIRAN_TOTAL_INCOME - HAZIRAN_TOTAL_EXPENSE // -14378

export const HAZIRAN_MODE = 'Kanama Durdurma Modu'
export const HAZIRAN_RULE = 'Yeni borç yok. Yeni taksit yok. Yeni araç aboneliği yok.'

export const HAZIRAN_EXPENSE_BREAKDOWN = [
  { id: 'enpara-cc', title: 'Enpara kredi kartı kalan borç', amount: 30000, type: 'credit_card' },
  { id: 'denizbank-struct', title: 'Denizbank yapılandırma ilk taksit', amount: 10700, type: 'restructured' },
  { id: 'kredi-1', title: 'Kredi 1 son taksit', amount: 10757, type: 'loan' },
  { id: 'kredi-2', title: 'Kredi 2', amount: 9121, type: 'loan' },
  { id: 'getir', title: 'Getir Yemek', amount: 3500, type: 'variable' },
  { id: 'migros', title: 'Migros', amount: 1200, type: 'market' },
  { id: 'spor', title: 'Spor Salonu (3 ay)', amount: 5000, type: 'planned' },
  { id: 'saz', title: 'Müzik Kursu', amount: 800, type: 'education' },
  { id: 'academy', title: 'Digital Academy', amount: 1800, type: 'education' },
] as const

// Haziran Simülatör senaryoları
export const CASH_FLOW_SCENARIOS = [
  {
    id: 'all',
    label: 'Tüm giderler yapılırsa',
    income: 58500,
    expense: 72878,
    net: -14378,
  },
  {
    id: 'defer_extras',
    label: 'Spor + saz + academy ertelenirse',
    income: 58500,
    expense: 72878 - 5000 - 800 - 1800,
    net: 58500 - (72878 - 5000 - 800 - 1800),
  },
  {
    id: 'only_debts',
    label: 'Sadece borçlar + yemek/market',
    income: 58500,
    expense: 30000 + 10700 + 10757 + 9121 + 1200 + 3500,
    net: 58500 - (30000 + 10700 + 10757 + 9121 + 1200 + 3500),
  },
] as const
