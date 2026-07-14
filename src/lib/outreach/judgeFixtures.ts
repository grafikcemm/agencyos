// ─────────────────────────────────────────────────────────────────────────────
// Judge FIXTURE kayıtları (FINALIZATION Faz 2) — canlı model judge'ın CI'daki
// deterministik vekili. Her kayıt, ilgili matris örneği için BEKLENEN judge
// kararının kaydıdır.
//
// DÜRÜSTLÜK NOTU: Bu kayıtlar 'pending human calibration' durumundadır —
// beklenen sınır davranışını temsil ederler; canlı judge + insan kalibrasyonu
// (PERSUASION_JUDGE_LIVE=1 koşusu + operatör onayı) yapılana kadar "insan
// onaylı" SAYILMAZLAR. Kalibrasyon durumu:
// docs/persuasion-golden-samples-2026-07-13.md
//
// Kapsam: klinik sektörünün ilk 6 kombinasyonu — 6 başarısızlık sınıfının
// TAMAMI bu dilimde temsil edilir (mod rotasyonu gereği).
// ─────────────────────────────────────────────────────────────────────────────

export interface JudgeFixture {
  scores: number[] // 5 kriter, 1-5
  gerekce: string[]
  toplamGecerMi: boolean
  note?: string
}

export const JUDGE_FIXTURES: Record<string, JudgeFixture> = {
  'mx-klinik-owner-cold-GOOD': {
    scores: [5, 5, 5, 5, 5],
    gerekce: ['Doğal Türkçe', 'Kanıt odaklı sakin ton', 'Sahibine müşteri/erişim dili', 'Profil gözlemi işletmeye özgü', 'Tek düşük-sürtünmeli CTA'],
    toplamGecerMi: true,
  },
  'mx-klinik-owner-cold-BAD-uydurma_iddia': {
    scores: [4, 1, 3, 4, 5],
    gerekce: ['Dil doğal', 'Kanıtsız "3 katına" vaadi güven kırar', 'Rol dili kısmen var', 'Gözlem var ama vaat gölgeliyor', 'CTA tek'],
    toplamGecerMi: false,
  },
  'mx-klinik-owner-follow_up-GOOD': {
    scores: [5, 5, 5, 5, 5],
    gerekce: ['Doğal', 'Sakin, itiraz karşılayan ton', 'Sahibine uygun çerçeve', 'Önceki gözleme bağlı', 'Tek çıkış-kolay CTA'],
    toplamGecerMi: true,
  },
  'mx-klinik-owner-follow_up-BAD-sahte_aciliyet': {
    scores: [3, 1, 4, 4, 4],
    gerekce: ['Ünlem/baskı dili', '"Son şans" sahte aciliyet', 'Rol dili var', 'Gözlem var', 'CTA tek ama baskılı kapanış'],
    toplamGecerMi: false,
  },
  'mx-klinik-owner-proposal-GOOD': {
    scores: [5, 5, 5, 5, 5],
    gerekce: ['Doğal', 'Gerekçeli, sakin teklif dili', 'Sahibine uygun', 'Gözleme dayalı teklif', 'Tek CTA'],
    toplamGecerMi: true,
  },
  'mx-klinik-owner-proposal-BAD-manipulasyon': {
    scores: [3, 2, 4, 4, 4],
    gerekce: ['Dil düzgün', 'Sahte kıtlık ("2 kontenjan") manipülatif', 'Rol dili var', 'Gözlem var', 'CTA tek ama korku çerçevesi'],
    toplamGecerMi: false,
  },
  'mx-klinik-cto-cold-GOOD': {
    scores: [5, 5, 5, 5, 5],
    gerekce: ['Doğal', 'Kanıt odaklı', "CTO'ya altyapı/teknik dil", 'Profil gözlemi özgü', 'Tek CTA'],
    toplamGecerMi: true,
  },
  'mx-klinik-cto-cold-BAD-klise': {
    scores: [2, 3, 4, 3, 5],
    gerekce: ['"Umarım bu mail..." çeviri kokulu klişe', 'Ton düşüyor', 'Rol dili var', 'Açılış jenerik', 'CTA tek'],
    toplamGecerMi: false,
  },
  'mx-klinik-cto-follow_up-GOOD': {
    scores: [5, 5, 5, 5, 5],
    gerekce: ['Doğal', 'İtiraz karşılayan sakin ton', "CTO'ya uygun", 'Gözleme bağlı', 'Tek CTA'],
    toplamGecerMi: true,
  },
  'mx-klinik-cto-follow_up-BAD-asiri_uzunluk': {
    scores: [2, 3, 4, 4, 3],
    gerekce: ['Aşırı uzunluk okunabilirliği bitiriyor', 'Ton dağılıyor', 'Rol dili var', 'Gözlem kayboluyor', 'CTA uzunluk içinde kayıp'],
    toplamGecerMi: false,
  },
  'mx-klinik-cto-proposal-GOOD': {
    scores: [5, 5, 5, 5, 5],
    gerekce: ['Doğal', 'Gerekçeli teklif dili', "CTO'ya uygun", 'Gözleme dayalı', 'Tek CTA'],
    toplamGecerMi: true,
  },
  'mx-klinik-cto-proposal-BAD-rol_uyumsuz': {
    scores: [4, 4, 1, 4, 5],
    gerekce: ['Dil doğal', 'Ton sakin', "CTO'ya finans dili — rol uyumsuz", 'Gözlem var', 'CTA tek'],
    toplamGecerMi: false,
  },
}

/** CI judge alt-kümesi: 6 başarısızlık sınıfının tamamını kapsayan dilim. */
export const JUDGE_CI_CASE_IDS = Object.keys(JUDGE_FIXTURES)
