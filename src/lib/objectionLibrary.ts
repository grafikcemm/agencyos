// İtiraz-cevap kütüphanesi — TR araştırma temelli. Müşteri itirazına karşı
// fiyat kırmadan değer/scope odaklı cevap. LeadModal'da + proposal akışında gösterilir.

export interface ObjectionEntry {
  id: string
  /** Müşteri itirazı (tetikleyici). */
  objection: string
  /** Önerilen taktik adı. */
  tactic: string
  /** Operatöre hazır cevap metni. */
  response: string
}

export const OBJECTION_LIBRARY: ObjectionEntry[] = [
  {
    id: 'discount',
    objection: 'Biraz indirim olur mu? / Fiyat bütçemizin üzerinde.',
    tactic: 'Scope reduction — fiyat kırma, kapsam daralt',
    response:
      'İndirim yerine kapsamı sadeleştirelim; böylece kaliteyi ve teslim hızını koruruz. Örneğin aylık üretim hacmini bir kademe düşürüp bütçenize oturtabiliriz.',
  },
  {
    id: 'free_sample',
    objection: 'Önce ücretsiz bir örnek/çalışma görelim.',
    tactic: 'Spec iş yapma — ücretli mini-audit/discovery öner',
    response:
      'Spekülatif tasarım yapmıyorum; isterseniz düşük ücretli bir mini-audit veya ücretli discovery ile başlayalım — somut değer görür, sonra tam pakete geçeriz.',
  },
  {
    id: 'payment_terms',
    objection: 'Ödemeyi teslimden sonra / ay sonunda yapsak?',
    tactic: 'Risk yönetimi — peşinat standardı, vade sonraya',
    response:
      'İlk işlerde üretim slotu ayırdığım için başlangıçta peşinatla ilerliyorum; kalan kısmı teslim milestone’una bağlayabiliriz. Güven oluştukça vade koşullarını yeniden değerlendiririz.',
  },
  {
    id: 'one_off',
    objection: 'Şimdilik tek seferlik deneyelim.',
    tactic: 'Pilot çerçevesi — retainer’a köprü',
    response:
      'Olur; ama bunu 30 günlük bir pilot gibi tasarlayalım. Sonuç oluşursa aylık düzene geçmek kolay olur, sıfırdan brief alma süresini de kısaltırız.',
  },
  {
    id: 'competitor_cheaper',
    objection: 'Bunu freelancer platformlarında çok daha ucuza yapanlar var.',
    tactic: 'Değer vurgusu — commodity vs sistem',
    response:
      'Haklısınız, sadece aracı kullanan operatörler var. Benim sunduğum, tek seferlik tasarım değil; markayı baştan ajanslaştırmadan hızlı ve tekrarlanabilir bir kreatif sistem. Aynı teslim ve revizyon yapısıyla kıyaslayalım.',
  },
  {
    id: 'not_now',
    objection: 'Şu an ilgilenmiyoruz / zamanı değil.',
    tactic: 'Düşük baskı — değer + ileri tarih',
    response:
      'Tamamen anlıyorum. İsterseniz size yükümlülüksüz kısa bir dijital analiz notu göndereyim; uygun bir döneme de görüşme planlayabiliriz.',
  },
]

export function findObjection(id: string): ObjectionEntry | undefined {
  return OBJECTION_LIBRARY.find((o) => o.id === id)
}
