// ─────────────────────────────────────────────────────────────────────────────
// MÜŞTERİ BELGE MERKEZİ — Türkiye ve Global paketler.
//
// Bu bir dosya adı listesi DEĞİLDİR. Her kayıt; hangi müşteri yaşam döngüsü
// aşamasına ait olduğunu, hangi verilerden üretilebileceğini, hangi girdilerin
// eksik olduğunu, imza/onay durumunu ve HANGİ UZMAN İNCELEMESİNİ gerektirdiğini
// taşır.
//
// TR ve EN sürümler BİRBİRİNE BAĞLI FAKAT AYRI hukuk metinleridir. Çeviri
// değildirler; `counterpart` alanı bağı kurar, içerik ayrı yönetilir.
//
// SİSTEM HUKUK DANIŞMANI DEĞİLDİR. Her belge `taslak` doğar ve
// `requiresReview` alanında yazan uzman incelemesinden geçmeden imzaya çıkamaz.
// ─────────────────────────────────────────────────────────────────────────────

export const DOCUMENT_DISCLAIMER =
  'Taslak — avukat ve/veya mali müşavir incelemesi gerekli. Bu sistem hukuki veya mali danışmanlık vermez.'

export type Jurisdiction = 'TR' | 'GLOBAL'

export type DocumentStage =
  | 'teklif'        // satış öncesi
  | 'sozlesme'      // anlaşma
  | 'onboarding'    // kurulum
  | 'teslimat'      // yürütme
  | 'tahsilat'      // ödeme
  | 'offboarding'   // kapanış
  | 'buyume'        // vaka/referans/yenileme
  | 'uyum'          // outreach uyum paketi

export type ReviewRequirement = 'avukat' | 'mali_musavir' | 'avukat_ve_mali_musavir' | 'yok'

export type DocumentStatus =
  | 'sablon_yok'      // henüz taslak metin üretilmedi
  | 'taslak'          // taslak var, inceleme bekliyor
  | 'incelendi'       // uzman inceledi
  | 'imzaya_hazir'
  | 'imzalandi'

export interface DocumentSpec {
  readonly id: string
  readonly jurisdiction: Jurisdiction
  readonly stage: DocumentStage
  readonly title: string
  /** Diğer yargı alanındaki karşılığı — çeviri değil, eş belge. */
  readonly counterpart: string | null
  /** Üretim için gereken veri alanları. Eksikse belge üretilemez. */
  readonly requiredInputs: readonly string[]
  /** Bu belgeyi hangi sistem verisi besliyor. */
  readonly sourcedFrom: readonly string[]
  readonly signatureRequired: boolean
  readonly requiresReview: ReviewRequirement
  readonly status: DocumentStatus
  readonly note?: string
}

const COMMON_CLIENT_INPUTS = ['musteri_unvani', 'musteri_adresi', 'yetkili_kisi', 'vergi_kimlik'] as const

function tr(
  id: string,
  stage: DocumentStage,
  title: string,
  counterpart: string | null,
  requiredInputs: readonly string[],
  sourcedFrom: readonly string[],
  signatureRequired: boolean,
  requiresReview: ReviewRequirement,
  note?: string,
): DocumentSpec {
  return { id, jurisdiction: 'TR', stage, title, counterpart, requiredInputs, sourcedFrom, signatureRequired, requiresReview, status: 'sablon_yok', note }
}

function en(
  id: string,
  stage: DocumentStage,
  title: string,
  counterpart: string | null,
  requiredInputs: readonly string[],
  sourcedFrom: readonly string[],
  signatureRequired: boolean,
  requiresReview: ReviewRequirement,
  note?: string,
): DocumentSpec {
  return { id, jurisdiction: 'GLOBAL', stage, title, counterpart, requiredInputs, sourcedFrom, signatureRequired, requiresReview, status: 'sablon_yok', note }
}

// ── TÜRKİYE PAKETİ ───────────────────────────────────────────────────────────
export const TR_DOCUMENTS: readonly DocumentSpec[] = [
  tr('tr-cerceve-hizmet-sozlesmesi', 'sozlesme', 'Çerçeve Hizmet Sözleşmesi', 'en-msa', [...COMMON_CLIENT_INPUTS, 'hizmet_kapsami', 'sure', 'fesih_kosullari'], ['leads', 'proposals'], true, 'avukat'),
  tr('tr-sow', 'sozlesme', 'Proje Kapsamı ve İş Emri (SOW)', 'en-sow', ['proje_adi', 'teslimat_listesi', 'takvim', 'kabul_olcutu'], ['proposals', 'projects'], true, 'avukat'),
  tr('tr-teklif', 'teklif', 'Teklif ve Fiyat Bilgilendirme Formu', 'en-proposal', ['hizmet_kalemleri', 'onayli_fiyat_surumu', 'gecerlilik_tarihi'], ['service_catalog', 'pricingVersions'], false, 'mali_musavir', 'Onaylı fiyat sürümü yoksa üretilemez.'),
  tr('tr-siparis-onay', 'sozlesme', 'Sipariş / Onay Formu', 'en-order-form', ['teklif_id', 'kabul_eden'], ['proposals'], true, 'yok'),
  tr('tr-nda', 'sozlesme', 'Gizlilik Sözleşmesi (NDA — karşılıklı/tek taraflı)', 'en-nda', [...COMMON_CLIENT_INPUTS, 'gizlilik_suresi'], ['leads'], true, 'avukat'),
  tr('tr-kvkk-aydinlatma', 'uyum', 'KVKK Aydınlatma Metni', 'en-privacy-notice', ['veri_kategorileri', 'isleme_amaci', 'saklama_suresi'], ['compliance_evidence'], false, 'avukat'),
  tr('tr-veri-isleme-protokolu', 'sozlesme', 'Veri İşleme Protokolü (veri sorumlusu–veri işleyen eki)', 'en-dpa', ['veri_kategorileri', 'alt_isleyenler', 'guvenlik_tedbirleri'], ['compliance_evidence'], true, 'avukat'),
  tr('tr-yurtdisi-aktarim', 'uyum', 'Yurt Dışı Veri Aktarımı Değerlendirmesi (gerekiyorsa KVKK standart sözleşme)', 'en-scc-idta', ['aktarim_ulkeleri', 'aktarim_amaci', 'guvence_yontemi'], ['compliance_evidence'], true, 'avukat'),
  tr('tr-alt-isleyen-listesi', 'uyum', 'Alt İşleyen / Sağlayıcı Listesi', 'en-subprocessors', ['saglayici_listesi'], ['VENDOR-DECISIONS'], false, 'avukat'),
  tr('tr-fikri-mulkiyet', 'sozlesme', 'Fikri Mülkiyet, Kullanım/Lisans, Kaynak Dosya ve Portföy İzni', 'en-ip-release', ['devir_kapsami', 'kaynak_dosya_teslimi', 'portfoy_izni'], ['projects'], true, 'avukat'),
  tr('tr-revizyon-talebi', 'teslimat', 'Revizyon / Değişiklik Talep Formu', 'en-change-order', ['proje_id', 'degisiklik_tanimi', 'ek_bedel'], ['projects'], true, 'yok'),
  tr('tr-teslim-kabul', 'teslimat', 'Teslim ve Kabul Tutanağı', 'en-acceptance', ['proje_id', 'teslim_listesi', 'kabul_tarihi'], ['projects'], true, 'yok'),
  tr('tr-onboarding-envanteri', 'onboarding', 'Onboarding Bilgi/Erişim Envanteri ve Yetkilendirme Formu', 'en-onboarding-schedule', ['erisim_listesi', 'yetkili_kisiler'], ['projects'], true, 'yok'),
  tr('tr-odeme-kosullari', 'tahsilat', 'Ödeme, Fatura, Gecikme, İptal ve Fesih Koşulları', 'en-payment-terms', ['odeme_plani', 'para_birimi', 'gecikme_faizi'], ['pricingVersions'], true, 'mali_musavir'),
  tr('tr-offboarding', 'offboarding', 'Offboarding, Erişim Kapatma, Veri İade/Silme Tutanağı', 'en-data-return', ['proje_id', 'veri_iade_yontemi'], ['projects'], true, 'avukat'),
  tr('tr-referans-izni', 'buyume', 'Referans / Testimonial Yayın İzni', 'en-testimonial-consent', ['musteri_unvani', 'yayin_kapsami'], ['projects'], true, 'yok'),
] as const

// ── GLOBAL / ENGLISH PAKETİ ──────────────────────────────────────────────────
export const GLOBAL_DOCUMENTS: readonly DocumentSpec[] = [
  en('en-msa', 'sozlesme', 'Master Services Agreement (MSA)', 'tr-cerceve-hizmet-sozlesmesi', ['client_legal_name', 'client_address', 'signatory', 'term', 'termination'], ['leads', 'proposals'], true, 'avukat'),
  en('en-sow', 'sozlesme', 'Statement of Work (SOW)', 'tr-sow', ['project_name', 'deliverables', 'timeline', 'acceptance_criteria'], ['proposals', 'projects'], true, 'avukat'),
  en('en-proposal', 'teklif', 'Proposal / Commercial Offer', 'tr-teklif', ['line_items', 'approved_pricing_version', 'valid_until'], ['service_catalog', 'pricingVersions'], false, 'mali_musavir', 'Blocked without an approved pricing version.'),
  en('en-order-form', 'sozlesme', 'Order Form', 'tr-siparis-onay', ['proposal_id', 'accepted_by'], ['proposals'], true, 'yok'),
  en('en-rate-card', 'teklif', 'Rate Card / Pricing & Assumptions Sheet', 'tr-teklif', ['approved_pricing_version', 'assumptions', 'currency'], ['pricingVersions'], false, 'mali_musavir'),
  en('en-nda', 'sozlesme', 'Mutual or One-way NDA', 'tr-nda', ['client_legal_name', 'confidentiality_term'], ['leads'], true, 'avukat'),
  en('en-dpa', 'sozlesme', 'Data Processing Addendum (DPA)', 'tr-veri-isleme-protokolu', ['data_categories', 'subprocessors', 'security_measures'], ['compliance_evidence'], true, 'avukat'),
  en('en-gdpr-clauses', 'uyum', 'GDPR / UK GDPR Clauses', 'tr-kvkk-aydinlatma', ['lawful_basis', 'data_subject_rights'], ['compliance_evidence'], true, 'avukat'),
  en('en-scc-idta', 'uyum', 'SCC / IDTA / Transfer Addendum Decision Pack', 'tr-yurtdisi-aktarim', ['transfer_countries', 'transfer_mechanism'], ['compliance_evidence'], true, 'avukat'),
  en('en-privacy-notice', 'uyum', 'Privacy Notice and Article 14 Prospect Notice', 'tr-kvkk-aydinlatma', ['source_of_data', 'retention', 'contact_for_rights'], ['compliance_evidence'], false, 'avukat'),
  en('en-subprocessors', 'uyum', 'Subprocessor List', 'tr-alt-isleyen-listesi', ['provider_list'], ['VENDOR-DECISIONS'], false, 'avukat'),
  en('en-ip-release', 'sozlesme', 'IP Assignment/License, Source-file and Portfolio Release', 'tr-fikri-mulkiyet', ['assignment_scope', 'source_file_delivery', 'portfolio_release'], ['projects'], true, 'avukat'),
  en('en-change-order', 'teslimat', 'Change Order', 'tr-revizyon-talebi', ['project_id', 'change_description', 'additional_fee'], ['projects'], true, 'yok'),
  en('en-acceptance', 'teslimat', 'Delivery Acceptance / Sign-off', 'tr-teslim-kabul', ['project_id', 'deliverables', 'acceptance_date'], ['projects'], true, 'yok'),
  en('en-onboarding-schedule', 'onboarding', 'Onboarding and Access/Security Schedule', 'tr-onboarding-envanteri', ['access_list', 'authorized_people'], ['projects'], true, 'yok'),
  en('en-payment-terms', 'tahsilat', 'Payment, Currency, Tax/VAT/Withholding, Late-payment, Cancellation and Termination Terms', 'tr-odeme-kosullari', ['payment_schedule', 'currency', 'tax_treatment'], ['pricingVersions'], true, 'mali_musavir'),
  en('en-governing-law', 'sozlesme', 'Governing Law, Jurisdiction, Liability, Indemnity, Warranty and Force Majeure', 'tr-cerceve-hizmet-sozlesmesi', ['governing_law', 'dispute_forum', 'liability_cap'], ['proposals'], true, 'avukat'),
  en('en-data-return', 'offboarding', 'Offboarding and Data Return/Deletion Certificate', 'tr-offboarding', ['project_id', 'return_method'], ['projects'], true, 'avukat'),
  en('en-testimonial-consent', 'buyume', 'Testimonial / Referral Consent', 'tr-referans-izni', ['client_legal_name', 'publication_scope'], ['projects'], true, 'yok'),
  en('en-tax-forms', 'tahsilat', 'Tax Residency and W-8 Form Checklist', null, ['entity_structure', 'tax_residency'], ['pricingVersions'], false, 'mali_musavir',
     'Form türü (W-8BEN / W-8BEN-E / W-8ECI …) şirket yapısı ve mali müşavir onayı olmadan VARSAYILMAZ.'),
] as const

// ── COLD OUTREACH UYUM PAKETİ ────────────────────────────────────────────────
export const OUTREACH_COMPLIANCE_PACK: readonly DocumentSpec[] = [
  tr('pack-country-policy', 'uyum', 'Ülke Politikası Kaydı', null, ['ulke_kodu', 'rejim', 'gereklilikler'], ['countryPolicy.ts'], false, 'avukat'),
  tr('pack-consent-lia', 'uyum', 'Consent / Meşru Menfaat (LIA) Kaydı', null, ['lawful_basis', 'degerlendirme_notu'], ['compliance_evidence'], false, 'avukat'),
  tr('pack-tacir-kaniti', 'uyum', 'Tacir/Esnaf Statüsü Kanıtı (TR)', null, ['ticaret_sicil_veya_esnaf_kaydi'], ['compliance_evidence'], false, 'avukat'),
  tr('pack-provenance', 'uyum', 'Kaynak / Provenance Kaydı', null, ['source_provider', 'source_url', 'acquired_at'], ['leads'], false, 'yok'),
  tr('pack-suppression-sop', 'uyum', 'Suppression / Opt-out SOP', null, ['ret_suresi', 'uygulama_yolu'], ['suppression_list'], false, 'avukat'),
  tr('pack-privacy-delivery', 'uyum', 'Aydınlatma Metni İletim Kaydı', null, ['privacy_notice_status'], ['leads'], false, 'avukat'),
  tr('pack-retention', 'uyum', 'Saklama ve Silme Politikası', null, ['saklama_suresi', 'silme_yontemi'], ['acquisition_epochs'], false, 'avukat'),
  tr('pack-breach-log', 'uyum', 'İhlal ve Şikâyet Kaydı', null, ['olay_tarihi', 'etki', 'aksiyon'], ['lead_action_audit'], false, 'avukat'),
  tr('pack-vendor-dpa', 'uyum', 'Sağlayıcı DPA / Alt İşleyen Kaydı', null, ['saglayici', 'dpa_durumu'], ['VENDOR-DECISIONS'], false, 'avukat'),
] as const

export const ALL_DOCUMENTS: readonly DocumentSpec[] = [
  ...TR_DOCUMENTS,
  ...GLOBAL_DOCUMENTS,
  ...OUTREACH_COMPLIANCE_PACK,
] as const

export function documentsFor(jurisdiction: Jurisdiction): readonly DocumentSpec[] {
  return ALL_DOCUMENTS.filter((d) => d.jurisdiction === jurisdiction)
}

export function documentById(id: string): DocumentSpec | null {
  return ALL_DOCUMENTS.find((d) => d.id === id) ?? null
}

/** Eş belge bağı — TR ↔ EN. Çeviri değil, karşılık. */
export function counterpartOf(id: string): DocumentSpec | null {
  const doc = documentById(id)
  return doc?.counterpart ? documentById(doc.counterpart) : null
}

export interface DocumentReadiness {
  id: string
  canDraft: boolean
  missingInputs: string[]
  blockers: string[]
}

/**
 * Belge taslağı üretilebilir mi. Eksik girdi varsa üretilmez — boş alanlı
 * "hukuki" metin üretmek, olmayan bir belgeye güvenmekten daha tehlikelidir.
 */
export function evaluateDocumentReadiness(
  doc: DocumentSpec,
  availableInputs: Readonly<Record<string, unknown>>,
): DocumentReadiness {
  const missingInputs = doc.requiredInputs.filter((k) => {
    const v = availableInputs[k]
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
  })
  const blockers: string[] = []
  if (missingInputs.length > 0) blockers.push(`Eksik girdi: ${missingInputs.join(', ')}`)
  if (doc.requiresReview !== 'yok') blockers.push(DOCUMENT_DISCLAIMER)
  return { id: doc.id, canDraft: missingInputs.length === 0, missingInputs, blockers }
}

/** Aşama etiketleri — arayüzde ham enum gösterilmez. */
export const STAGE_LABEL: Record<DocumentStage, string> = {
  teklif: 'Teklif',
  sozlesme: 'Sözleşme',
  onboarding: 'Kurulum',
  teslimat: 'Teslimat',
  tahsilat: 'Tahsilat',
  offboarding: 'Kapanış',
  buyume: 'Büyüme',
  uyum: 'Uyum',
}

export const STATUS_LABEL: Record<DocumentStatus, string> = {
  sablon_yok: 'Şablon hazırlanmadı',
  taslak: 'Taslak — inceleme bekliyor',
  incelendi: 'İncelendi',
  imzaya_hazir: 'İmzaya hazır',
  imzalandi: 'İmzalandı',
}

export const REVIEW_LABEL: Record<ReviewRequirement, string> = {
  avukat: 'Avukat incelemesi gerekli',
  mali_musavir: 'Mali müşavir incelemesi gerekli',
  avukat_ve_mali_musavir: 'Avukat ve mali müşavir incelemesi gerekli',
  yok: 'Uzman incelemesi gerekmiyor',
}
