// ─────────────────────────────────────────────────────────────────────────────
// Persuasion eval MATRİSİ (FINALIZATION Faz 2) — GERÇEK 5 sektör × 6 rol ×
// 3 aşama = 90 kombinasyon. Her kombinasyonda:
//   GOOD: tüm deterministik kriterleri geçmesi BEKLENEN sınır örneği
//   BAD:  kombinasyon indeksine göre dönen 6 başarısızlık sınıfından biri
//         (kanıtsız iddia · sahte aciliyet/spam · manipülasyon · klişe ·
//          aşırı uzunluk · rol uyumsuzluğu) — beklenen kriter(ler) kayıtlı.
// Örnekler DETERMİNİSTİK ŞABLONDAN üretilir (el yazımı 10'luk set
// persuasionEval.ts'te ayrıca durur); model yok, CI'da her koşuda birebir aynı.
// ─────────────────────────────────────────────────────────────────────────────

import type { FunnelStage, GoldenCase, PersuasionContext, PersuasionCriterion, PersuasionRole } from './persuasionEval'

export const MATRIX_SECTORS = ['klinik', 'güzellik', 'ecommerce', 'hukuk', 'restoran'] as const
export const MATRIX_ROLES: PersuasionRole[] = ['owner', 'cto', 'cfo', 'marketing', 'operations', 'other']
export const MATRIX_STAGES: FunnelStage[] = ['cold', 'follow_up', 'proposal']

const OPT_OUT = 'Bu tür e-postaları almak istemiyorsanız "ret" yazarak yanıtlamanız yeterlidir.'

/** Sektör-özgü gözlem cümlesi — rol işareti KELİMESİ içermez (rol-uyumu
 *  kriterinin sinyali yalnız rol cümlesinden gelsin diye). */
const SECTOR_OBSERVATION: Record<(typeof MATRIX_SECTORS)[number], { businessName: string; observation: string }> = {
  klinik: {
    businessName: 'Denta Klinik',
    observation: "Denta Klinik'in Google profiline baktım; web sitesi bağlantısı göremedim.",
  },
  güzellik: {
    businessName: 'Nova Güzellik',
    observation: "Nova Güzellik'in Instagram profilini inceledim; site ya da rezervasyon bağlantısı göremedim.",
  },
  ecommerce: {
    businessName: 'ModaShop',
    observation: "ModaShop'un sitesine baktım; ürün sayfalarının açılışının belirgin biçimde yavaş olduğunu fark ettim.",
  },
  hukuk: {
    businessName: 'Lex Hukuk',
    observation: "Lex Hukuk'un sitesini inceledim; iletişim formunun yanıt sayfasının hata verdiğini gördüm.",
  },
  restoran: {
    businessName: 'Lezzet Durağı',
    observation: "Lezzet Durağı'nın Google profiline baktım; menü ve site bağlantısı göremedim.",
  },
}

/** Rol-özgü değer cümlesi — ROLE_MARKERS ile hizalı işaret kelimeleri içerir;
 *  CTA kalıbı ve iddia kalıbı İÇERMEZ. */
const ROLE_VALUE: Record<PersuasionRole, string> = {
  owner: 'Bu, yeni müşterinin size ulaşmasını gereksiz yere zorlaştırıyor olabilir.',
  cto: 'Mevcut altyapıyı bozmadan, teknik tarafı sade tutan bir yaklaşım öneriyorum.',
  cfo: 'Maliyeti öngörülebilir tutan, geri dönüşü net bir paket olarak düşünüyorum.',
  marketing: 'Marka görünürlüğü tarafında küçük dokunuşlarla belirgin fark yaratılabilir.',
  operations: 'Günlük akışta manuel yürüyen işleri otomatik hale getirmek ekibe nefes aldırır.',
  other: 'Kısa ve somut bir öneri hazırladım; karar tamamen sizde.',
}

interface StageParts {
  opening: string
  objection: string | null
  cta: string
}

const STAGE_PARTS: Record<FunnelStage, StageParts> = {
  cold: {
    opening: 'Merhaba,',
    objection: null,
    cta: 'Kısa bir görüşme için 15 dakika uygun musunuz?',
  },
  follow_up: {
    opening: 'Merhaba, geçen hafta kısaca yazmıştım.',
    objection: 'Önerim büyük bir taahhüt değil; mevcut düzeninizi bozmayan küçük bir başlangıç.',
    cta: 'Yanlış zamansa tek kelime "sonra" yazmanız yeterli.',
  },
  proposal: {
    opening: 'Merhaba, sözünü ettiğim teklifi hazırladım.',
    objection: 'Bu büyük bir taahhüt değil; kademeli ve durdurması kolay bir plan.',
    cta: 'Uygunsanız 15 dakikada birlikte üzerinden geçelim mi?',
  },
}

/** 6 başarısızlık sınıfı — kombinasyon indeksine göre döner. */
export type FailureMode =
  | 'uydurma_iddia'
  | 'sahte_aciliyet'
  | 'manipulasyon'
  | 'klise'
  | 'asiri_uzunluk'
  | 'rol_uyumsuz'

const FAILURE_MODES: FailureMode[] = [
  'uydurma_iddia',
  'sahte_aciliyet',
  'manipulasyon',
  'klise',
  'asiri_uzunluk',
  'rol_uyumsuz',
]

const FAILURE_EXPECT: Record<FailureMode, Array<PersuasionCriterion['key']>> = {
  uydurma_iddia: ['uydurma_iddia_yok'],
  sahte_aciliyet: ['sakin_kanit_odakli_ton'],
  manipulasyon: ['manipulasyon_yok'],
  klise: ['spam_klise_yok'],
  asiri_uzunluk: ['uzunluk_uygun'],
  rol_uyumsuz: ['rol_uyumu'],
}

function goodBody(sector: (typeof MATRIX_SECTORS)[number], role: PersuasionRole, stage: FunnelStage): string {
  const s = SECTOR_OBSERVATION[sector]
  const p = STAGE_PARTS[stage]
  const parts = [
    p.opening,
    '',
    s.observation,
    ROLE_VALUE[role],
    ...(stage === 'proposal' ? ['Teklifte her adımı bu gözlemlere dayanarak tek tek gerekçelendirdim.'] : []),
    ...(p.objection ? ['', p.objection] : []),
    '',
    p.cta,
    '',
    OPT_OUT,
  ]
  return parts.join('\n')
}

function badBody(base: string, mode: FailureMode, role: PersuasionRole): string {
  switch (mode) {
    case 'uydurma_iddia':
      return base.replace('\n\n' + OPT_OUT, `\nCironuzu 90 günde 3 katına çıkarırız.\n\n${OPT_OUT}`)
    case 'sahte_aciliyet':
      return base.replace('\n\n' + OPT_OUT, `\nBu fırsat için son şans, kaçırmayın!\n\n${OPT_OUT}`)
    case 'manipulasyon':
      return base.replace(
        '\n\n' + OPT_OUT,
        `\nSadece 2 kontenjan kaldı; bugün karar vermezseniz yerinizi kaybedersiniz.\n\n${OPT_OUT}`,
      )
    case 'klise':
      return `Umarım bu mail sizi iyi bulur.\n${base}`
    case 'asiri_uzunluk': {
      const filler = Array.from(
        { length: 30 },
        (_, i) => `Süreç boyunca ${i + 1}. adımı da sizinle birlikte netleştirir, her detayı önceden yazılı paylaşırız.`,
      ).join(' ')
      return base.replace('\n\n' + OPT_OUT, `\n${filler}\n\n${OPT_OUT}`)
    }
    case 'rol_uyumsuz': {
      // Rol cümlesi, işaret kelimeleri kesişmeyen BAŞKA rolün cümlesiyle değiştirilir.
      const wrong: Partial<Record<PersuasionRole, PersuasionRole>> = {
        owner: 'cto',
        cto: 'cfo',
        cfo: 'other',
        marketing: 'cfo',
        operations: 'cfo',
      }
      const w = wrong[role]
      return w ? base.replace(ROLE_VALUE[role], ROLE_VALUE[w]) : base
    }
  }
}

function matrixCtx(
  sector: (typeof MATRIX_SECTORS)[number],
  role: PersuasionRole,
  stage: FunnelStage,
  observation: string,
): PersuasionContext {
  return {
    sector,
    role,
    funnelStage: stage,
    businessName: SECTOR_OBSERVATION[sector].businessName,
    contactName: null,
    channel: 'email',
    evidenceIds: ['ev-matrix'],
    // Gözlem cümlesi iddia kalıpları içerir (baktım/inceledim/gördüm) →
    // GOOD örnekte SPESİFİK kanıt bağıyla kapsanır; BAD-uydurma eklemesi kapsanmaz.
    claimEvidence: [{ claim: observation, evidenceIds: ['ev-matrix'] }],
    bannedPhrases: [],
    previousTexts: [],
  }
}

/** 90 kombinasyon × (GOOD + BAD) = 180 deterministik sınır örneği. */
export function buildPersuasionMatrix(): GoldenCase[] {
  const cases: GoldenCase[] = []
  let idx = 0
  for (const sector of MATRIX_SECTORS) {
    for (const role of MATRIX_ROLES) {
      for (const stage of MATRIX_STAGES) {
        const obs = SECTOR_OBSERVATION[sector].observation
        const base = goodBody(sector, role, stage)
        const ctx = matrixCtx(sector, role, stage, obs)
        const subject = `${SECTOR_OBSERVATION[sector].businessName} — kısa not`

        cases.push({
          id: `mx-${sector}-${role}-${stage}-GOOD`,
          ctx,
          sample: { subject, body: base },
          expectPass: true,
        })

        // Rol uyumsuzluğu 'other' rolünde deterministik olarak ölçülemez
        // (işaret zorunluluğu yok) → o kombinasyonlarda kanıtsız-iddia sınıfı.
        let mode = FAILURE_MODES[idx % FAILURE_MODES.length]
        if (mode === 'rol_uyumsuz' && role === 'other') mode = 'uydurma_iddia'
        cases.push({
          id: `mx-${sector}-${role}-${stage}-BAD-${mode}`,
          ctx,
          sample: { subject, body: badBody(base, mode, role) },
          expectPass: false,
          expectFail: FAILURE_EXPECT[mode],
        })
        idx++
      }
    }
  }
  return cases
}

export const PERSUASION_MATRIX: GoldenCase[] = buildPersuasionMatrix()
