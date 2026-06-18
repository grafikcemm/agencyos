import 'server-only'
import { callLight, callMedium } from '@/lib/openrouter'
import { loadBusinessSlices, formatSlicesBlock, hasRealData, type BusinessSlice } from '@/lib/agents/businessContext'
import { sanitizeForTelegram } from './mentorLoop'
import type { ConversationTurn } from './classifyQuestion'

// ─────────────────────────────────────────────────────────────────────────────
// İş deliberasyon motoru — "müşteriler kim / kimi arayayım" gibi iş sorularında
// ajanları arka planda PARALEL düşündürür, gerçek AgencyOS verisini çeker ve
// TEK Türkçe sesle (Ajan X dedi YOK) net cevap + ≤4 somut aksiyon döner.
//
// council/route.ts şekli (Promise.allSettled görüşler → sentezci) yeniden kullanılır.
// Görüşler ucuz Flash-lite (callLight), yalnızca sentez Haiku (callMedium).
// ASLA fırlatmaz — her hata yolunda kullanılabilir bir Türkçe cevaba düşer.
// ─────────────────────────────────────────────────────────────────────────────

export interface DeliberateResult {
  reply: string
  actions: string[]
  usedSlices: string[]
  degraded: boolean
}

interface RolePrompt {
  label: string
  system: string
}

const ROLE_PROMPTS: RolePrompt[] = [
  {
    label: 'sales',
    system:
      'Sen Grafikcem ajansının Satış Direktörü\'sün. Sana verilen GERÇEK İŞ VERİSİ\'ne dayanarak ' +
      'bugün hangi leadlerin aranması/temas edilmesi gerektiğini, önceliklendirmeyi ve dönüşüm açısını ' +
      'belirt. Sadece veride GÖRÜNEN firma/lead isimlerini kullan, uydurma. 2-3 kısa madde, Türkçe.',
  },
  {
    label: 'growth',
    system:
      'Sen Grafikcem ajansının Büyüme Direktörü\'sün. GERÇEK İŞ VERİSİ\'ndeki sektör dağılımı ve ' +
      'fırsat sinyallerine bakarak bu hafta hangi sektöre/kanala yüklenilmesi gerektiğini ve somut bir ' +
      'outreach hamlesini öner. 2-3 kısa madde, Türkçe. Veride olmayan rakam/isim uydurma.',
  },
  {
    label: 'ops',
    system:
      'Sen Grafikcem ajansının Operasyon & Veri analisti\'sin. GERÇEK İŞ VERİSİ\'ndeki funnel/MRR ' +
      'durumuna bakarak darboğazı (ör. çok "new" az "contacted") ve bugünkü tek operasyonel önceliği ' +
      'söyle. 2-3 kısa madde, Türkçe. Sadece verideki sayıları kullan.',
  },
]

const SYNTH_SYSTEM =
  'Sen Cem\'in kişisel iş asistanısın (Chief of Staff). Departman görüşlerini ve GERÇEK İŞ VERİSİ\'ni ' +
  'TEK bir sese indirgersin. KURALLAR:\n' +
  '1. "Strateji dedi / Satış dedi" gibi ajan atıfı YAPMA. Tek, net, sıcak Türkçe cevap ver.\n' +
  '2. Telefon, firma adı, sektör, sayı gibi somut bilgileri YALNIZCA GERÇEK İŞ VERİSİ bloğundan al — asla uydurma.\n' +
  '3. Önce 1-2 cümle net durum/cevap, sonra "Aksiyonlar:" başlığı altında en fazla 4 somut adım (her biri yeni satırda "- " ile).\n' +
  '4. Aksiyonlar uygulanabilir olsun (kimi ara, hangi leade odaklan, sıradaki tek adım). Kısa tut, dolambaçlı yazma.'

function buildUserBlock(userText: string, dataBlock: string, opinions: string[]): string {
  const opinionsBlock = opinions.length
    ? `\n\nDEPARTMAN GÖRÜŞLERİ (içsel — kullanıcıya atıf yapma):\n${opinions.join('\n---\n')}`
    : ''
  return `KULLANICININ SORUSU:\n${userText}\n\nGERÇEK İŞ VERİSİ:\n${dataBlock}${opinionsBlock}`
}

// "- adım" / "→ adım" / "• adım" / "1. adım" satırlarını aksiyon olarak ayıkla.
function parseActions(reply: string): string[] {
  const out: string[] = []
  for (const line of reply.split('\n')) {
    const m = line.trim().match(/^(?:[-•→*]|\d+[.)])\s+(.+)$/)
    if (m && m[1].trim().length > 0) out.push(m[1].trim())
  }
  return out.slice(0, 4)
}

// Sentez başarısızsa: ham veri diliminden deterministik, kullanılabilir cevap üret.
function degradedReply(userText: string, slices: BusinessSlice[]): string {
  if (!hasRealData(slices)) {
    return 'Şu an pipeline\'da işlenebilir veri görünmüyor. Önce bir lead taraması yapmalıyız — istersen "tarama yap" de.'
  }
  const leads = slices.find((s) => s.key === 'leads')
  const lead3 = leads
    ? leads.text.split('\n').filter((l) => /^\d+\./.test(l.trim())).slice(0, 3).join('\n')
    : ''
  const head = 'Detaylı analiz şu an toparlanamadı ama eldeki gerçek veriden özet:'
  const body = lead3 || formatSlicesBlock(slices).slice(0, 800)
  return `${head}\n\n${body}\n\nDaha derin analiz için biraz sonra tekrar sorabilirsin.`
}

export async function deliberateBusiness(
  userText: string,
  _history?: ConversationTurn[],
): Promise<DeliberateResult> {
  void _history // ileride bağlam için; mevcut deliberation canlı veri dilimlerinden besleniyor
  // 1) Gerçek iş verisini paralel yükle (asla fırlatmaz).
  const slices = await loadBusinessSlices()
  const dataBlock = formatSlicesBlock(slices)
  const usedSlices = slices.map((s) => s.key)

  // 2) Departman görüşleri — paralel, allSettled (tek model hatası batch'i batırmaz).
  const opinionResults = await Promise.allSettled(
    ROLE_PROMPTS.map((r) => callLight(r.system, buildUserBlock(userText, dataBlock, []), 300)),
  )
  const opinions = opinionResults
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && !!r.value?.trim())
    .map((r) => r.value.trim())

  // 3) Sentez — tek ses (callMedium). Hata → deterministik degraded cevap.
  let synthesized: string | null = null
  try {
    synthesized = await callMedium(SYNTH_SYSTEM, buildUserBlock(userText, dataBlock, opinions), 700)
  } catch (error) {
    console.error('deliberateBusiness sentez hatası:', error)
    synthesized = null
  }

  if (!synthesized || synthesized.trim().length === 0) {
    const reply = sanitizeForTelegram(degradedReply(userText, slices))
    return { reply, actions: parseActions(reply), usedSlices, degraded: true }
  }

  const reply = sanitizeForTelegram(synthesized.trim())
  return { reply, actions: parseActions(synthesized), usedSlices, degraded: false }
}
