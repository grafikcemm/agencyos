// ─────────────────────────────────────────────────────────────────────────────
// Golden persuasion eval (Sprint-3 Faz 3.9-3.11) — sektör × rol × funnel aşaması.
//
// İki katman:
// 1) DETERMİNİSTİK değerlendirme (bu dosya + testler): qualityLint çekirdeği +
//    ek ikna kriterleri. CI'da her koşuda çalışır; model YOK.
// 2) MODEL-JUDGE prompt'u (buildJudgePrompt): insan-onaylı örneklerle birlikte
//    kullanılmak üzere hazır — CI'da ÇAĞRILMAZ (maliyet + determinizm);
//    çağıran operatör/batch aracıdır. İnsan onay örnekleri:
//    docs/persuasion-golden-samples-2026-07-13.md
//
// Kriterler (spec Faz 3.10):
//   dogal_turkce · sakin_kanit_odakli_ton · spam_klise_yok · uydurma_iddia_yok ·
//   isletmeye_ozel · tek_dusuk_surtunme_cta · itiraz_karsilama (follow_up/teklif) ·
//   tekrar_dusuk (metinler arası)
// ─────────────────────────────────────────────────────────────────────────────

import { lintOutreachDraft, type ClaimEvidenceEntry } from './qualityLint'

export type FunnelStage = 'cold' | 'follow_up' | 'proposal'
export type PersuasionRole = 'owner' | 'cto' | 'cfo' | 'marketing' | 'operations' | 'other'

export interface PersuasionContext {
  sector: string
  role: PersuasionRole
  funnelStage: FunnelStage
  businessName: string
  contactName?: string | null
  channel: 'email' | 'whatsapp'
  /** Lead'in geçerli kanıt id'leri (uydurma-iddia kontrolü için). */
  evidenceIds: string[]
  claimEvidence?: ClaimEvidenceEntry[]
  bannedPhrases: string[]
  /** Aynı lead'e önceki metinler — tekrar_dusuk kriteri. */
  previousTexts?: string[]
}

export interface PersuasionCriterion {
  key:
    | 'dogal_turkce'
    | 'sakin_kanit_odakli_ton'
    | 'spam_klise_yok'
    | 'uydurma_iddia_yok'
    | 'isletmeye_ozel'
    | 'tek_dusuk_surtunme_cta'
    | 'itiraz_karsilama'
    | 'tekrar_dusuk'
  pass: boolean
  detail: string | null
}

export interface PersuasionScore {
  pass: boolean
  criteria: PersuasionCriterion[]
}

const OBJECTION_MARKERS =
  /(anla[şs][ıi]l[ıi]r|önceli[ğg]iniz de[ğg]il|yanl[ıi][şs] zamansa|b[üu]y[üu]k bir taahh[üu]t de[ğg]il|mevcut ak[ıi][şs][ıi]n[ıi]z[ıi] bozmayan|"sonra" yazman[ıi]z yeterli)/i
const EVIDENCE_TONE = /(inceledim|bakt[ıi]m|fark ettim|g[öo]rd[üu]m|g[öo]r[üu]n[üu]yor|g[öo]remedim|profilinizde|sitenizde)/i

function sentencesOf(s: string): string[] {
  return s
    .split(/[.!?\n]+/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 20 && !x.startsWith('merhaba'))
}

/** Metinler arası cümle-tekrar oranı (0..1). */
export function repetitionRatio(body: string, previousTexts: string[]): number {
  const current = sentencesOf(body)
  if (current.length === 0) return 0
  const prev = new Set(previousTexts.flatMap(sentencesOf))
  if (prev.size === 0) return 0
  const overlap = current.filter((s) => prev.has(s)).length
  return overlap / current.length
}

function naturalTurkish(body: string): { pass: boolean; detail: string | null } {
  const capsWords = (body.match(/\b[A-ZÇĞİÖŞÜ]{4,}\b/g) ?? []).filter((w) => w !== 'MERSİS')
  if (capsWords.length > 0) return { pass: false, detail: `BÜYÜK HARF bağırma: ${capsWords[0]}` }
  const exclaims = (body.match(/!/g) ?? []).length
  if (exclaims > 1) return { pass: false, detail: `${exclaims} ünlem — satış bağırması` }
  if (/[!?.]{3,}/.test(body)) return { pass: false, detail: 'yığılmış noktalama' }
  const sents = body.split(/[.!?\n]+/).map((x) => x.trim()).filter((x) => x.split(/\s+/).length > 2)
  if (sents.length > 0) {
    const avg = sents.reduce((a, x) => a + x.split(/\s+/).length, 0) / sents.length
    if (avg > 30) return { pass: false, detail: 'aşırı uzun cümleler (ort. >30 kelime)' }
  }
  return { pass: true, detail: null }
}

export function evaluatePersuasion(
  text: { subject: string | null; body: string },
  ctx: PersuasionContext,
): PersuasionScore {
  const lint = lintOutreachDraft({
    subject: text.subject,
    body: text.body,
    businessName: ctx.businessName,
    contactName: ctx.contactName ?? null,
    evidenceIds: ctx.evidenceIds,
    claimEvidence: ctx.claimEvidence ?? [],
    bannedPhrases: ctx.bannedPhrases,
    channel: ctx.channel,
  })
  const has = (code: string) => lint.violations.some((v) => v.code === code)

  const natural = naturalTurkish(text.body)
  const criteria: PersuasionCriterion[] = [
    { key: 'dogal_turkce', pass: natural.pass, detail: natural.detail },
    {
      key: 'sakin_kanit_odakli_ton',
      pass: !has('SPAM_RISK_LANGUAGE') && (EVIDENCE_TONE.test(text.body) || (ctx.claimEvidence ?? []).length > 0),
      detail: has('SPAM_RISK_LANGUAGE')
        ? 'aciliyet/garanti dili'
        : EVIDENCE_TONE.test(text.body) || (ctx.claimEvidence ?? []).length > 0
          ? null
          : 'gözlem/kanıt cümlesi yok — jenerik satış tonu',
    },
    {
      key: 'spam_klise_yok',
      pass: !has('GENERIC_CLICHE') && !has('VOICE_BANNED_PHRASE'),
      detail: has('GENERIC_CLICHE') ? 'klişe kalıp' : has('VOICE_BANNED_PHRASE') ? 'yasaklı ifade' : null,
    },
    {
      key: 'uydurma_iddia_yok',
      pass: !has('CLAIM_WITHOUT_EVIDENCE'),
      detail: has('CLAIM_WITHOUT_EVIDENCE') ? 'kanıtsız somut iddia' : null,
    },
    {
      key: 'isletmeye_ozel',
      pass: !has('NO_BUSINESS_CONTEXT'),
      detail: has('NO_BUSINESS_CONTEXT') ? 'işletme bağlamı yok' : null,
    },
    {
      key: 'tek_dusuk_surtunme_cta',
      pass: !has('MULTIPLE_CTA') && !has('NO_CTA'),
      detail: has('MULTIPLE_CTA') ? 'birden çok CTA' : has('NO_CTA') ? 'CTA yok' : null,
    },
    {
      key: 'itiraz_karsilama',
      // Cold ilk temasta zorunlu değil; follow_up/proposal aşamasında beklenir.
      pass: ctx.funnelStage === 'cold' ? true : OBJECTION_MARKERS.test(text.body),
      detail:
        ctx.funnelStage !== 'cold' && !OBJECTION_MARKERS.test(text.body)
          ? 'itiraz karşılama cümlesi yok (follow-up/teklif aşamasında beklenir)'
          : null,
    },
    (() => {
      const ratio = repetitionRatio(text.body, ctx.previousTexts ?? [])
      return {
        key: 'tekrar_dusuk' as const,
        pass: ratio < 0.3,
        detail: ratio >= 0.3 ? `önceki metinlerle %${Math.round(ratio * 100)} cümle tekrarı` : null,
      }
    })(),
  ]

  return { pass: criteria.every((c) => c.pass), criteria }
}

/**
 * Model-judge prompt'u — CI'da ÇAĞRILMAZ; operatör/batch değerlendirmesi için.
 * Deterministik lint'in ölçemediği boyutları (akıcılık, ton sıcaklığı,
 * rol-uyumu) 1-5 skorlar. İnsan onay örnekleri referans dosyada.
 */
export function buildJudgePrompt(text: { subject: string | null; body: string }, ctx: PersuasionContext): string {
  return [
    'Sen deneyimli bir Türk B2B satış editörüsün. Aşağıdaki mesajı değerlendir.',
    `Bağlam: sektör=${ctx.sector}, alıcı rolü=${ctx.role}, aşama=${ctx.funnelStage}, kanal=${ctx.channel}.`,
    'Kriterler (her biri 1-5 puan + tek cümle gerekçe):',
    '1. Türkçesi doğal mı (çeviri kokusu, yapay kalıp var mı)?',
    '2. Ton profesyonel, sakin ve kanıt odaklı mı (satış baskısı yok)?',
    '3. Alıcının ROLÜNE uygun çerçeve mi (örn. sahibine gelir dili, CTO\'ya teknik dil)?',
    '4. İşletmeye özgü mü, yoksa herhangi bir işletmeye gönderilebilir mi?',
    '5. CTA tek ve düşük sürtünmeli mi?',
    'YALNIZ JSON döndür: {"scores":[5 puan],"gerekce":["..."],"toplamGecerMi":true|false}',
    '',
    `KONU: ${text.subject ?? '(yok)'}`,
    'GÖVDE:',
    text.body,
  ].join('\n')
}

// ── Golden set: sektör × rol × funnel matrisi ────────────────────────────────
export interface GoldenCase {
  id: string
  ctx: PersuasionContext
  sample: { subject: string | null; body: string }
  expectPass: boolean
  /** expectPass=false ise: başarısız OLMASI GEREKEN kriterler. */
  expectFail?: Array<PersuasionCriterion['key']>
}

const OPT_OUT = 'Bu tür e-postaları almak istemiyorsanız "ret" yazarak yanıtlamanız yeterlidir.'

function ctx(over: Partial<PersuasionContext>): PersuasionContext {
  return {
    sector: 'klinik',
    role: 'owner',
    funnelStage: 'cold',
    businessName: 'Denta Klinik',
    contactName: null,
    channel: 'email',
    evidenceIds: ['ev-1'],
    claimEvidence: [],
    bannedPhrases: [],
    previousTexts: [],
    ...over,
  }
}

export const PERSUASION_GOLDEN_SET: GoldenCase[] = [
  {
    id: 'klinik-owner-cold-GOOD',
    ctx: ctx({
      claimEvidence: [{ claim: "Denta Klinik'in Google profiline baktım", evidenceIds: ['ev-1'] }],
    }),
    sample: {
      subject: 'Denta Klinik — web siteniz üzerine kısa not',
      body: `Merhaba,\n\nDenta Klinik'in Google profiline baktım; web sitesi bağlantısı göremedim. Hastaların çoğu randevudan önce online arama yapıyor — burada görünür olmak fark yaratıyor.\n\nBenzer kliniklerle çalışıyorum; isterseniz 15 dakikada mevcut durumu birlikte değerlendirelim mi?\n\n${OPT_OUT}`,
    },
    expectPass: true,
  },
  {
    id: 'klinik-owner-cold-BAD-uydurma-iddia',
    ctx: ctx({}),
    sample: {
      subject: 'Denta Klinik — hasta sayınızı artıralım',
      body: `Merhaba,\n\nDenta Klinik randevularını 90 günde 3 katına çıkarabiliriz. Müşterileriniz mesaj atıp cevap alamayınca rakibe geçiyor.\n\n15 dakika uygun musunuz?\n\n${OPT_OUT}`,
    },
    expectPass: false,
    expectFail: ['uydurma_iddia_yok'],
  },
  {
    id: 'guzellik-operations-cold-GOOD-whatsapp',
    ctx: ctx({ sector: 'güzellik', role: 'operations', channel: 'whatsapp', businessName: 'Nova Güzellik' }),
    sample: {
      subject: null,
      body: 'Merhaba, Nova Güzellik\'in Instagram profilinde online randevu bağlantısı göremedim; telefonla randevu yönetimi ekibe ciddi zaman kaybettiriyor olabilir. Otomatik hatırlatma ve randevu akışını kısa bir demoda göstereyim mi?',
    },
    expectPass: true,
  },
  {
    id: 'ecommerce-marketing-cold-BAD-klise-spam',
    ctx: ctx({ sector: 'ecommerce', role: 'marketing', businessName: 'ModaShop' }),
    sample: {
      subject: 'İNANILMAZ fırsat!!!',
      body: `Umarım bu mail sizi iyi bulur. ModaShop için sektörünüzde lider bir çözüm ortağınız olarak sinerji yaratmak istiyoruz. Bu fırsat SADECE BUGÜN geçerli, hemen dönüş yapın!\n\nHemen arayın! Ayrıca web sitemizi de inceleyin! Bir de demo talep edin!\n\n${OPT_OUT}`,
    },
    expectPass: false,
    expectFail: ['spam_klise_yok', 'dogal_turkce'],
  },
  {
    id: 'hukuk-cfo-followup-GOOD-itiraz',
    ctx: ctx({ sector: 'hukuk', role: 'cfo', funnelStage: 'follow_up', businessName: 'Lex Hukuk' }),
    sample: {
      subject: 'Lex Hukuk — kısa takip',
      body: `Merhaba,\n\nGeçen hafta Lex Hukuk'un sitenizdeki iletişim akışına dair yazmıştım. Genelde bu noktada "şu an önceliğimiz değil" cevabı gelir — gayet anlaşılır.\n\nÖnerim zaten büyük bir taahhüt değil; mevcut akışınızı bozmayan küçük bir başlangıç. Yanlış zamansa tek kelime "sonra" yazmanız yeterli.\n\n${OPT_OUT}`,
    },
    expectPass: true,
  },
  {
    id: 'hukuk-cfo-followup-BAD-itiraz-yok',
    ctx: ctx({ sector: 'hukuk', role: 'cfo', funnelStage: 'follow_up', businessName: 'Lex Hukuk' }),
    sample: {
      subject: 'Lex Hukuk — tekrar ben',
      body: `Merhaba,\n\nLex Hukuk sitesine dair önceki mesajım gözünüzden kaçmış olabilir diye kısa bir hatırlatma bırakıyorum.\n\n15 dakikalık bir görüşmeye açık olur musunuz?\n\n${OPT_OUT}`,
    },
    expectPass: false,
    expectFail: ['itiraz_karsilama'],
  },
  {
    id: 'klinik-owner-followup-BAD-tekrar',
    ctx: ctx({
      funnelStage: 'follow_up',
      previousTexts: [
        `Merhaba,\n\nDenta Klinik'in Google profiline baktım; web sitesi bağlantısı göremedim. Hastaların çoğu randevudan önce online arama yapıyor — burada görünür olmak fark yaratıyor.\n\n15 dakikalık kısa bir görüşmeye açık olur musunuz?`,
      ],
    }),
    sample: {
      subject: 'Denta Klinik — tekrar',
      body: `Merhaba,\n\nDenta Klinik'in Google profiline baktım; web sitesi bağlantısı göremedim. Hastaların çoğu randevudan önce online arama yapıyor — burada görünür olmak fark yaratıyor.\n\nGenelde bu noktada "şu an önceliğimiz değil" cevabı gelir — gayet anlaşılır.\n\n${OPT_OUT}`,
    },
    expectPass: false,
    expectFail: ['tekrar_dusuk'],
  },
  {
    id: 'ecommerce-cto-proposal-GOOD-kanitli-iddia',
    ctx: ctx({
      sector: 'ecommerce',
      role: 'cto',
      funnelStage: 'proposal',
      businessName: 'ModaShop',
      evidenceIds: ['ev-speed'],
      claimEvidence: [
        { claim: "ModaShop'un sitesini inceledim", evidenceIds: ['ev-speed'] },
        { claim: 'mobil açılış süreniz 6 saniyenin üzerinde', evidenceIds: ['ev-speed'] },
      ],
    }),
    sample: {
      subject: 'ModaShop — teklif özeti',
      body: `Merhaba,\n\nModaShop'un sitesini inceledim: mobil açılış süreniz 6 saniyenin üzerinde görünüyor; bu, sepete ekleme öncesi terk riskini artırır. Teklifte bu ölçümü ve modernizasyon adımlarını tek tek gerekçelendirdim.\n\nBu büyük bir taahhüt değil; mevcut altyapınızı bozmayan kademeli bir plan.\n\nUygunsanız 15 dakikada üzerinden geçelim mi?\n\n${OPT_OUT}`,
    },
    expectPass: true,
  },
  {
    id: 'guzellik-owner-cold-BAD-cok-cta',
    ctx: ctx({ sector: 'güzellik', businessName: 'Nova Güzellik' }),
    sample: {
      subject: 'Nova Güzellik — birkaç öneri',
      body: `Merhaba,\n\nNova Güzellik'in profiline baktım; randevu bağlantısı göremedim. Hemen arayın! Ayrıca web sitemizden randevu talep edin! Bir de örnek çalışmalarımı inceleyin, demo talep edin!\n\n${OPT_OUT}`,
    },
    expectPass: false,
    expectFail: ['tek_dusuk_surtunme_cta'],
  },
  {
    id: 'restoran-other-cold-BAD-jenerik',
    ctx: ctx({ sector: 'restoran', role: 'other', businessName: 'Lezzet Durağı' }),
    sample: {
      subject: 'Dijital çözümler',
      body: `Merhaba,\n\nDijital dünyada görünür olmak artık her işletme için çok önemli. Size özel çözümlerimizle tanışmak ister misiniz?\n\n${OPT_OUT}`,
    },
    expectPass: false,
    expectFail: ['isletmeye_ozel', 'sakin_kanit_odakli_ton'],
  },
]
