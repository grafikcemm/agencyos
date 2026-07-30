import 'server-only'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { lifeSupabaseAdmin } from '@/lib/lifeSupabaseAdmin'
import { parseJsonBody, BadRequestError } from '@/lib/api/guards'
import {
  authErrorResponse, bodyHash, envelope, findReplay, requireCemosAuth,
  requireWriteHeaders, writeAudit, type CemosScope,
} from './cemosLifeAuth'

// ─────────────────────────────────────────────────────────────────────────────
// LIFE yazma yolu — TEK sarmalayıcı.
//
// Her route aynı sırayı izlemek ZORUNDA: scope → başlıklar → replay → şema →
// mutasyon → denetim. Sıra route başına elle yazılsaydı biri unutulur ve o
// route sessizce korumasız kalırdı; burada unutmak mümkün değil.
//
// FAIL-CLOSED: şema `.strict()`, gövde 100 KB ile sınırlı, bilinmeyen alan
// reddedilir. Kuyruk YOKTUR — yazma başarısızsa çağıran hata alır, "sonra
// denerim" diye bir ara durum üretilmez (ikinci doğruluk kaynağı olurdu).
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_WRITE_BYTES = 100_000

type Handler<T> = (input: T) => Promise<{ summary: Record<string, unknown> }>

export async function handleWrite<Schema extends z.ZodTypeAny>(
  req: Request,
  route: string,
  method: string,
  schema: Schema,
  handler: Handler<z.infer<Schema>>,
  scope: CemosScope = 'write',
): Promise<NextResponse> {
  let idempotencyKey: string | null = null
  try {
    requireCemosAuth(req, scope)
    idempotencyKey = requireWriteHeaders(req).idempotencyKey

    // TEKRAR OYNATMA: aynı anahtarla başarılı bir yazma varsa mutasyon
    // TEKRARLANMAZ. Ağ koptuğunda GrafikcemOS aynı isteği yeniden gönderebilir.
    const onceki = await findReplay(idempotencyKey)
    if (onceki) {
      return NextResponse.json(
        envelope(route, { ...(onceki.responseSummary ?? {}), replayed: true }, ['Bu istek daha önce işlendi.']),
      )
    }

    const input = await parseJsonBody(req, schema, MAX_WRITE_BYTES)
    const { summary } = await handler(input)

    await writeAudit({
      route, method, scope, idempotencyKey, requestHash: bodyHash(input),
      status: 200, responseSummary: summary,
    })
    return NextResponse.json(envelope(route, { ...summary, replayed: false }))
  } catch (e) {
    const status = e instanceof BadRequestError ? 400 : undefined
    const res = status ? NextResponse.json({ error: (e as Error).message, code: 'bad_request' }, { status }) : authErrorResponse(e)
    await writeAudit({
      route, method, scope,
      // Basarisiz yazmanin anahtari KAYDEDILMEZ: kaydedilseydi gecici bir hata
      // sonrasi ayni anahtarla yapilan mesru bir yeniden deneme "zaten islendi"
      // sanilirdi ve mutasyon HIC gerceklesmezdi.
      idempotencyKey: null,
      status: res.status, error: String((e as Error)?.message ?? e).slice(0, 200),
    })
    return res
  }
}

/** Ortak alan şemaları — hepsi `.strict()`, bilinmeyen alan reddedilir. */
export const TaskCreate = z.object({
  title: z.string().min(1).max(300),
  category: z.enum(['active', 'waiting', 'someday']).optional(),
  note: z.string().max(2000).optional(),
  description: z.string().max(5000).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isPriority: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
}).strict()

export const TaskPatch = z.object({
  title: z.string().min(1).max(300).optional(),
  isDone: z.boolean().optional(),
  category: z.enum(['active', 'waiting', 'someday']).optional(),
  note: z.string().max(2000).optional(),
  description: z.string().max(5000).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isPriority: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
}).strict().refine((o) => Object.keys(o).length > 0, { message: 'En az bir alan gerekli.' })

export const StepCreate = z.object({
  title: z.string().min(1).max(300),
  sortOrder: z.number().int().min(0).max(100000).optional(),
}).strict()

export const StepPatch = z.object({
  title: z.string().min(1).max(300).optional(),
  isDone: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
}).strict().refine((o) => Object.keys(o).length > 0, { message: 'En az bir alan gerekli.' })

export const HabitLog = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().int().min(0).max(10000),
}).strict()

/** camelCase istek → snake_case sütun. Eşleme TEK yerde. */
export const taskColumns = (o: z.infer<typeof TaskPatch>) => {
  const c: Record<string, unknown> = {}
  if (o.title !== undefined) c.title = o.title
  if (o.isDone !== undefined) c.is_done = o.isDone
  if (o.category !== undefined) c.category = o.category
  if (o.note !== undefined) c.note = o.note
  if (o.description !== undefined) c.description = o.description
  if (o.dueDate !== undefined) c.due_date = o.dueDate
  if (o.isPriority !== undefined) c.is_priority = o.isPriority
  if (o.sortOrder !== undefined) c.sort_order = o.sortOrder
  return c
}

export const stepColumns = (o: z.infer<typeof StepPatch>) => {
  const c: Record<string, unknown> = {}
  if (o.title !== undefined) c.title = o.title
  if (o.isDone !== undefined) c.is_done = o.isDone
  if (o.sortOrder !== undefined) c.sort_order = o.sortOrder
  return c
}

/** Yol parametresinden sayısal kimlik — geçersizse yazma yapılmaz. */
export function numericId(raw: string, alan = 'id'): number {
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) throw new BadRequestError(`Geçersiz ${alan}.`)
  return n
}

export { lifeSupabaseAdmin }
