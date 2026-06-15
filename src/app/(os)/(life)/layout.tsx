import type { ReactNode } from 'react'

// Yaşam (Feed The Goat) sayfaları için tema sarmalayıcı.
// theme-mid: FTG "denge" enerji modu — --accent'i emphasis (beyaz) değerine
// çevirir, böylece portlanan FTG bileşenleri orijinal görünür. Sarı marka
// rengi bileşenlerde --accent-yellow / explicit hex olarak korunur.
export default function LifeLayout({ children }: { children: ReactNode }) {
  return <div className="theme-mid">{children}</div>
}
