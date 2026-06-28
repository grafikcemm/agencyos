// Günlük vitamin/supplement programı — "Günlük vitaminler" alışkanlık detayında gösterilir.
// Kullanıcının verdiği listeden birebir.

export type SupplementItem = {
  name: string
  amount?: string
  note?: string
}

export type SupplementBlock = {
  key: string
  label: string
  items: SupplementItem[]
}

export const VITAMIN_PLAN: SupplementBlock[] = [
  {
    key: 'gun_icinde',
    label: 'Gün İçinde',
    items: [
      { name: 'Alpha-GPC + Tyrosine', note: 'Sabah kahve ile' },
      { name: 'B12' },
      { name: 'D3 + K2', amount: 'Damla' },
      { name: 'C Vitamini' },
      { name: 'Omega 3' },
    ],
  },
  {
    key: 'antrenman_sonrasi',
    label: 'Antrenman Sonrası',
    items: [
      { name: 'Gold Whey veya Isowhey', amount: '1 ölçek' },
      { name: 'Kreatin', amount: '1 ölçek' },
      { name: 'Magnezyum', amount: '1 şase' },
      { name: 'Multivitamin', amount: '1 kapsül' },
    ],
  },
]
