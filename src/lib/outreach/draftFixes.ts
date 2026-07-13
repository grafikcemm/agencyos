// ─────────────────────────────────────────────────────────────────────────────
// "Bu ihlalleri düzelt" (Sprint-3 Faz 4.3) — DETERMİNİSTİK, LLM'siz düzeltici.
//
// Kapı ihlallerinin MEKANİK olarak düzeltilebilir alt kümesini uygular:
//   SUBJECT_TOO_LONG  → kelime sınırında kısalt
//   GENERIC_CLICHE    → klişeyi içeren cümleyi çıkar
//   SPAM_RISK_LANGUAGE→ spam ifadesini içeren cümleyi çıkar
//   VOICE_BANNED_PHRASE→ yasak ifadeyi içeren cümleyi çıkar
//   MULTIPLE_CTA      → İLK CTA cümlesi kalır, sonrakiler çıkar
//   CLAIM_WITHOUT_EVIDENCE → kanıtsız iddiayı içeren cümleyi çıkar
//   MISSING_OPT_OUT   → standart opt-out satırı ekle
//   BODY_TOO_LONG     → sondan paragraf düşerek sınıra çek
// İÇERİK GEREKTİRENLER otomatik düzeltilemez (remaining olarak döner):
//   SUBJECT_MISSING · NO_BUSINESS_CONTEXT · NO_CTA
// Düzeltme SONRASI metin yine kapıdan geçer (çağıran yeniden değerlendirir) —
// bu modül kapının yerine geçmez.
// ─────────────────────────────────────────────────────────────────────────────

import type { QualityViolation } from './qualityLint'

export interface FixResult {
  subject: string
  body: string
  /** Uygulanan düzeltmelerin insan-okur listesi. */
  applied: string[]
  /** Otomatik düzeltilemeyen ihlal kodları (içerik gerektirir). */
  notFixable: QualityViolation['code'][]
}

const SUBJECT_MAX = 78
const BODY_MAX_CHARS = 1800
const OPT_OUT_LINE =
  'Bu tür e-postaları almak istemiyorsanız "ret" yazarak yanıtlamanız yeterlidir.'

function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ş/g, 's')
    .replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u')
}

/** detail içindeki tırnaklı parçayı çıkarır: `Cliché: "x"` → x. */
function quotedFragment(detail: string): string | null {
  const m = detail.match(/["“]([^"”]{2,})["”]/)
  return m ? m[1] : null
}

/** Verilen parçayı içeren cümleleri gövdeden çıkarır (satır yapısını korur). */
function dropSentencesContaining(body: string, fragment: string): { body: string; dropped: boolean } {
  const target = fold(fragment)
  let dropped = false
  const lines = body.split('\n').map((line) => {
    // Cümle bazında böl; parçayı içeren cümleyi at.
    const parts = line.split(/(?<=[.!?])\s+/)
    const kept = parts.filter((p) => {
      const hit = fold(p).includes(target)
      if (hit) dropped = true
      return !hit
    })
    return kept.join(' ')
  })
  // Boşalan satırlar sadeleşir (çift boş satır tekilleşir).
  const out = lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim()
  return { body: out, dropped }
}

const CTA_SENTENCE = /(15\s*dakika|k[ıi]sa bir g[öo]r[üu][şs]me|uygun musunuz|uygun olur mu|cevaplaman[ıi]z yeterli|g[öo]r[üu][şs]elim mi|arayabilir miyim|g[öo]stereyim mi|payla[şs]abilir miyim|yazay[ıi]m m[ıi]|yazman[ıi]z yeterli|de[ğg]erlendirelim mi|[üu]zerinden ge[çc]elim mi|inceleyelim mi)/i

export function applyViolationFixes(
  subject: string,
  body: string,
  violations: Array<Pick<QualityViolation, 'code' | 'detail'>>,
): FixResult {
  let outSubject = subject
  let outBody = body
  const applied: string[] = []
  const notFixable: QualityViolation['code'][] = []

  for (const v of violations) {
    switch (v.code) {
      case 'SUBJECT_TOO_LONG': {
        if (outSubject.length > SUBJECT_MAX) {
          const cut = outSubject.slice(0, SUBJECT_MAX)
          outSubject = cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).trim()
          applied.push('Konu kısaltıldı')
        }
        break
      }
      case 'GENERIC_CLICHE':
      case 'SPAM_RISK_LANGUAGE':
      case 'VOICE_BANNED_PHRASE':
      case 'CLAIM_WITHOUT_EVIDENCE': {
        const frag = quotedFragment(v.detail)
        if (frag) {
          const r = dropSentencesContaining(outBody, frag)
          if (r.dropped) {
            outBody = r.body
            applied.push(
              v.code === 'CLAIM_WITHOUT_EVIDENCE'
                ? `Kanıtsız iddia çıkarıldı: "${frag}"`
                : `Sorunlu ifade çıkarıldı: "${frag}"`,
            )
          }
        } else {
          notFixable.push(v.code)
        }
        break
      }
      case 'MULTIPLE_CTA': {
        // İlk CTA cümlesi kalır; sonraki CTA cümleleri çıkar.
        let seen = false
        const lines = outBody.split('\n').map((line) => {
          const parts = line.split(/(?<=[.!?])\s+/)
          const kept = parts.filter((p) => {
            if (!CTA_SENTENCE.test(p)) return true
            if (!seen) {
              seen = true
              return true
            }
            return false
          })
          return kept.join(' ')
        })
        outBody = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
        applied.push('Fazla CTA cümleleri çıkarıldı (ilk CTA korundu)')
        break
      }
      case 'MISSING_OPT_OUT': {
        if (!fold(outBody).includes(fold('istemiyorsanız'))) {
          outBody = `${outBody.trim()}\n\n${OPT_OUT_LINE}`
          applied.push('Opt-out/İYS satırı eklendi')
        }
        break
      }
      case 'BODY_TOO_LONG': {
        while (outBody.length > BODY_MAX_CHARS && outBody.includes('\n\n')) {
          // Opt-out satırını koruyarak sondan bir önceki paragrafı düş.
          const paras = outBody.split('\n\n')
          const optIdx = paras.findIndex((p) => fold(p).includes(fold('istemiyorsanız')))
          const dropIdx = optIdx === paras.length - 1 ? paras.length - 2 : paras.length - 1
          if (dropIdx <= 0) break
          paras.splice(dropIdx, 1)
          outBody = paras.join('\n\n')
        }
        if (outBody.length <= BODY_MAX_CHARS) applied.push('Gövde kısaltıldı (sondan paragraf düşüldü)')
        break
      }
      case 'SUBJECT_MISSING':
      case 'NO_BUSINESS_CONTEXT':
      case 'NO_CTA':
      default:
        notFixable.push(v.code)
        break
    }
  }

  return { subject: outSubject, body: outBody, applied, notFixable: [...new Set(notFixable)] }
}

/**
 * Faz 4.2: ihlali metindeki bölgeye bağlar — editörün vurgulaması için
 * (start,end) aralığı döner; bulunamazsa null (ihlal metin-dışı: konu, yapı).
 */
export function anchorViolation(
  body: string,
  violation: Pick<QualityViolation, 'code' | 'detail'>,
): { start: number; end: number } | null {
  const frag = quotedFragment(violation.detail)
  if (!frag) return null
  const idx = fold(body).indexOf(fold(frag))
  if (idx < 0) return null
  return { start: idx, end: idx + frag.length }
}
