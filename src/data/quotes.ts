// Günlük söz havuzu — quote_pool tablosu boş/erişilemez olduğunda kullanılan
// statik yedek. quoteActions.ensureTodayQuote() bu listeden rastgele seçer.
// Şekil: { aphorism, theme }  (theme -> daily_quotes.author olarak yazılır).
export interface FallbackQuote {
  aphorism: string
  theme: string
}

export const FALLBACK_QUOTES: FallbackQuote[] = [
  { aphorism: "Disiplin, hedef ile başarı arasındaki köprüdür.", theme: "Disiplin" },
  { aphorism: "Bugün yapabileceğini yarına bırakma; momentum her şeydir.", theme: "Eylem" },
  { aphorism: "Küçük ve tutarlı adımlar, büyük ve dağınık çabaları yener.", theme: "Tutarlılık" },
  { aphorism: "Değer üret, para onu takip eder.", theme: "Değer" },
  { aphorism: "Rahatsızlık, büyümenin gerçekleştiği yerdir.", theme: "Büyüme" },
  { aphorism: "Odaklanmak, hayır demeyi bilmektir.", theme: "Odak" },
  { aphorism: "Mükemmeli bekleme; ilerlemeyi yayına al.", theme: "İlerleme" },
  { aphorism: "Enerjini tükettiğin yere değil, kazandığın yere yatır.", theme: "Enerji" },
  { aphorism: "Sistemler hedeflerden güçlüdür; süreci tasarla.", theme: "Sistem" },
  { aphorism: "Sabır, uzun vadeli oyunu oynayanların silahıdır.", theme: "Sabır" },
  { aphorism: "Net düşünmek, net yazmaktan geçer.", theme: "Netlik" },
  { aphorism: "Bir şeyi ölçemiyorsan, onu yönetemezsin.", theme: "Ölçüm" },
]
