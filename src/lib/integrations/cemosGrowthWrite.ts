import 'server-only'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase'
import { parseJsonBody, BadRequestError } from '@/lib/api/guards'
import { authErrorResponse, bodyHash, envelope, requireWriteHeaders } from './cemosLifeAuth'
import { findGrowthReplay, requireGrowthAuth, writeGrowthAudit, type GrowthScope } from './cemosGrowthAuth'

// ─────────────────────────────────────────────────────────────────────────────
// GROWTH yazma yolu — RT-A1'in sırasıyla BİREBİR aynı:
//   scope → başlıklar → replay → şema → mutasyon → denetim
//
// Sıra kopyalanmadı, DAVRANIŞ kopyalandı: burada da tek sarmalayıcı var, çünkü
// sırayı route başına elle yazmak, bir route'un sessizce korumasız kalması
// demektir.
//
// ÖNERİ BİR KARAR DEĞİLDİR. GrafikcemOS buraya yalnız `proposed` durumunda
// satır yazabilir. Hiçbir öneri kendiliğinden uygulanmaz, hiçbir gönderim
// tetiklemez; kokpitte SALT OKUNUR görünür ve uygulanıp uygulanmayacağına
// operatör AgencyOS içinde karar verir.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_GROWTH_WRITE_BYTES = 50_000

/**
 * `clientId` handler'a BURADAN geçirilir.
 *
 * Route'un kendi `requireGrowthAuth` çağrısını yapması cazipti ama yanlış: hız
 * sınırı çağrı başına sayaç düşürür, yani aynı istek için iki kez doğrulamak
 * yazma limitini sessizce YARIYA indirirdi.
 */
type Handler<T> = (input: T, ctx: { clientId: string }) => Promise<{ summary: Record<string, unknown> }>

export async function handleGrowthWrite<Schema extends z.ZodTypeAny>(
  req: Request,
  route: string,
  method: string,
  schema: Schema,
  handler: Handler<z.infer<Schema>>,
  scope: GrowthScope = 'write',
): Promise<NextResponse> {
  let idempotencyKey: string | null = null
  try {
    const { clientId } = requireGrowthAuth(req, scope)
    idempotencyKey = requireWriteHeaders(req).idempotencyKey

    const onceki = await findGrowthReplay(idempotencyKey)
    if (onceki) {
      return NextResponse.json(
        envelope(route, { ...(onceki.responseSummary ?? {}), replayed: true }, ['Bu istek daha önce işlendi.']),
      )
    }

    const input = await parseJsonBody(req, schema, MAX_GROWTH_WRITE_BYTES)
    const { summary } = await handler(input, { clientId })

    await writeGrowthAudit({
      route, method, scope, idempotencyKey, requestHash: bodyHash(input),
      status: 200, responseSummary: summary,
    })
    return NextResponse.json(envelope(route, { ...summary, replayed: false }))
  } catch (e) {
    const status = e instanceof BadRequestError ? 400 : undefined
    const res = status
      ? NextResponse.json({ error: (e as Error).message, code: 'bad_request' }, { status })
      : authErrorResponse(e)
    await writeGrowthAudit({
      route, method, scope,
      // Başarısız yazmanın anahtarı KAYDEDİLMEZ — aksi hâlde meşru bir yeniden
      // deneme "zaten işlendi" sanılır ve mutasyon HİÇ gerçekleşmez.
      idempotencyKey: null,
      status: res.status, error: String((e as Error)?.message ?? e).slice(0, 200),
    })
    return res
  }
}

/**
 * Öneri şeması — `.strict()`, serbest metin alanları KISA.
 *
 * Uzunluk sınırları keyfi değil: bu alanlar bir panelde okunacak. 5000 karakterlik
 * bir "gerekçe" okunmaz, dolayısıyla karara girmez — ama depolanır ve bir gün
 * içine PII sızar. Kısa tutmak hem okunur hem güvenli.
 */
export const RecommendationCreate = z
  .object({
    kind: z.enum(['experiment', 'source', 'copy', 'targeting']),
    title: z.string().trim().min(8).max(120),
    rationale: z.string().trim().min(20).max(1000),
    proposedChange: z.string().trim().min(8).max(500),
    /** Kanıt işareti — ham metin DEĞİL, çıktı/koşu referansı. */
    evidenceRef: z.string().trim().max(200).optional().nullable(),
    /** Öneri hangi deneye ait (varsa). */
    experimentKey: z.string().trim().max(80).optional().nullable(),
    /** Üretenin kendi güveni. Karar değil, sinyal. */
    confidence: z.enum(['low', 'medium', 'high']),
    /** Örneklem yetersizse üreten taraf bunu SÖYLEMELİ. */
    sampleSufficient: z.boolean(),
  })
  .strict()

export type RecommendationInput = z.infer<typeof RecommendationCreate>

/** E-posta/telefon gibi doğrudan iletişim bilgisi öneriye SIZAMAZ. */
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/
const PHONE_RE = /(\+?\d[\d\s().-]{8,})/

export function detectPii(input: RecommendationInput): string[] {
  const found: string[] = []
  const text = [input.title, input.rationale, input.proposedChange, input.evidenceRef ?? ''].join(' ')
  if (EMAIL_RE.test(text)) found.push('email')
  if (PHONE_RE.test(text)) found.push('phone')
  return found
}

export async function insertRecommendation(input: RecommendationInput, clientId: string) {
  const pii = detectPii(input)
  if (pii.length) {
    // Reddetmek doğru davranış: PII'yi temizleyip yazmak, gönderenin ne
    // gönderdiğini bilmemesi demek olurdu.
    throw new BadRequestError(`Öneri iletişim bilgisi içeriyor (${pii.join(', ')}) — yazılmadı.`)
  }
  const { data, error } = await supabaseAdmin
    .from('cemos_recommendations')
    .insert({
      client_id: clientId,
      kind: input.kind,
      title: input.title,
      rationale: input.rationale,
      proposed_change: input.proposedChange,
      evidence_ref: input.evidenceRef ?? null,
      experiment_key: input.experimentKey ?? null,
      confidence: input.confidence,
      sample_sufficient: input.sampleSufficient,
      // Durum HER ZAMAN `proposed`. İstemci bunu seçemez — şemada alan bile yok.
      status: 'proposed',
    })
    .select('id')
    .single()
  if (error) throw error
  return { id: data?.id as string | undefined }
}
