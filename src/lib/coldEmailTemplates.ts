// Soğuk e-posta şablon kütüphanesi — TR pazar araştırması temelli 4 açı.
// Şablonlar LLM'e "tercih edilen açı" olarak verilir; LLM iskeleti doldurur ve
// klişe yasağına uyar (bkz. buildColdEmailSystemPrompt). Şablon, lead sinyallerine
// göre seçilir: aktif reklam → lansman, işe alım ilanı → işe-alım,
// web yok/Instagram-only/zayıf görsel → before-after, aksi halde mini-audit.

export type ColdEmailTemplateId = 'mini_audit' | 'launch' | 'hiring' | 'before_after'

export interface ColdEmailTemplate {
  id: ColdEmailTemplateId
  /** Operatöre gösterilecek kısa etiket. */
  label: string
  /** LLM'e verilecek açı talimatı — ne tür bir kanca kurulacağını anlatır. */
  angle: string
  /** Değişken alanlı örnek iskelet — LLM bunu birebir kopyalamaz, ton/yapı referansı alır. */
  skeleton: string
}

export const COLD_EMAIL_TEMPLATES: Record<ColdEmailTemplateId, ColdEmailTemplate> = {
  mini_audit: {
    id: 'mini_audit',
    label: 'Mini-audit',
    angle:
      'Satış görüşmesi istemeden önce ücretsiz, somut bir mini-inceleme (3 maddelik audit) teklif et. ' +
      'Karşılıklılık ilkesi: önce değer ver, sonra düşük baskılı CTA.',
    skeleton:
      'Merhaba, {kanal} tarafınızda kısa bir inceleme yaptım. Özellikle {somut_gözlem} ' +
      'marka dilini biraz dağıtıyor. Sosyal medya tasarımı, marka görselleri ve web/landing ' +
      'düzenini tek akışta toparlıyorum. İsterseniz satış görüşmesi değil, 3 maddelik kısa bir mini-audit gönderebilirim. Uygun musunuz?',
  },
  launch: {
    id: 'launch',
    label: 'Lansman / kampanya',
    angle:
      'İşletmede aktif reklam / yeni kampanya / lansman sinyali var. Bu dönemde kreatiflerin ' +
      'aynı hızda güncellenmemesinin getirdiği kaçağa odaklan; hızlı kreatif üretim/varyasyon vaadi ver.',
    skeleton:
      'Merhaba, son dönemde {lansman_sinyali} gördüm. Bu tip dönemlerde en büyük kaçak, ürün/hizmet ' +
      'iyi olsa da kreatiflerin aynı hızda güncellenmemesi oluyor. {sektör} markalarında hızlı kreatif ' +
      'üretim ve varyasyona odaklanıyorum. İsterseniz {kanal} için 2 hızlı iyileştirme fikri göndereyim.',
  },
  hiring: {
    id: 'hiring',
    label: 'İşe alım sinyali',
    angle:
      'İşletme tasarım/sosyal medya/içerik rolü için ilan açmış. Tam zamanlı istihdam maliyeti vs ' +
      'dışarıdan esnek kapasite arbitrajını karar vericinin önüne koy; "geçiş dönemi" desteği öner.',
    skeleton:
      'Merhaba, {rol} ilanınızı gördüm. Bu genelde içerik akışının veya görsel üretim kapasitesinin ' +
      'arttığını gösteriyor. Ekip kurulana kadar arada kapasite açığı yaşarsanız; sosyal medya tasarımları, ' +
      'hareketli içerik ve hızlı kampanya kreatiflerinde dışarıdan destek verebiliyorum. İsterseniz size ' +
      'uygun bir geçiş dönemi setup’ı atayım.',
  },
  before_after: {
    id: 'before_after',
    label: 'Before / after',
    angle:
      'Web sitesi yok / sadece Instagram linki var / görsel kalite zayıf. Somut görsel bir tutarsızlığa ' +
      'işaret et; baştan ajanslaştırmadan hızlı ve düzenli kreatif sistem kurma çerçevesi ver. Before/after örneği öner.',
    skeleton:
      'Merhaba, {Instagram/site} görünümünüzde bir şey dikkatimi çekti: {somut_görsel_problem}. Bu tip ' +
      'küçük tutarsızlıklar ilk güven sinyalini zayıflatıyor. Ben markayı baştan ajanslaştırmadan, hızlı ve ' +
      'düzenli bir kreatif sistem kuruyorum. İsterseniz benzer bir "önce/sonra" örneği paylaşayım.',
  },
}

export interface TemplateSelectionSignals {
  hasAdsSignal?: boolean | null
  hasJobSignal?: boolean | null
  instagramAsSite?: boolean | null
  hasRealWebsite?: boolean | null
  rating?: number | null
}

/**
 * Lead sinyallerinden en uygun şablonu seçer. Öncelik sırası:
 * işe alım > aktif reklam > zayıf dijital yüz (before/after) > mini-audit (default).
 */
export function selectColdEmailTemplate(signals: TemplateSelectionSignals): ColdEmailTemplateId {
  if (signals.hasJobSignal) return 'hiring'
  if (signals.hasAdsSignal) return 'launch'
  if (signals.instagramAsSite || signals.hasRealWebsite === false) return 'before_after'
  return 'mini_audit'
}
