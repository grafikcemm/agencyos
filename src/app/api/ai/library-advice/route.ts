import { NextRequest, NextResponse } from 'next/server'
import { enforceSameOrigin } from '@/lib/api/guards'
import { requireApiAccess } from '@/lib/auth'
import { isSameOrigin, checkRateLimit } from '@/lib/commandCenter/security'
import { callLight } from '@/lib/openrouter'

// POST /api/ai/library-advice
// LibraryAssistantPanel'in beklediği AI okuma koçu. Endpoint eksikti → panel 404
// alıyordu (M4). Oturum + same-origin + rate-limit korumalı.

interface LibraryAdvice {
  activeBookAdvice: string
  shouldContinueCurrentBook: boolean
  nextBook: string | null
  reason: string
  todayReadingTarget: string
  avoidStarting: string[]
  actionFromBook: string
}

const FALLBACK: LibraryAdvice = {
  activeBookAdvice: 'Şu an aktif kitabına odaklan; bugün küçük ama kesintisiz bir blok oku.',
  shouldContinueCurrentBook: true,
  nextBook: null,
  reason: 'AI geçici olarak erişilemedi; güvenli varsayılan öneri gösteriliyor.',
  todayReadingTarget: '15 sayfa veya 20 dakika',
  avoidStarting: [],
  actionFromBook: 'Okuduğun son bölümden tek bir uygulanabilir not çıkar.',
}

export async function POST(req: NextRequest) {
  const access = await requireApiAccess(req)
  if ('response' in access) return access.response
  const originError = enforceSameOrigin(req)
  if (originError) return originError
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
  }
  if (checkRateLimit(req, 15)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let body: {
    activeBook?: { title?: string; author?: string; category?: string } | null
    completedCount?: number
    totalBooks?: number
    prompt?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  }

  const active = body.activeBook
    ? `${body.activeBook.title ?? 'Bilinmeyen'}${body.activeBook.author ? ' — ' + body.activeBook.author : ''}`
    : 'Aktif kitap yok'

  const systemPrompt = `Sen Grafikcem'in kişisel okuma koçusun. Kullanıcının okuma planına net, kısa, uygulanabilir koçluk verirsin.
Yanıtı KESİNLİKLE geçerli JSON olarak döndür, markdown/code-block YOK. JSON şeması tam olarak:
{
  "activeBookAdvice": "string",
  "shouldContinueCurrentBook": true,
  "nextBook": "string | null",
  "reason": "string",
  "todayReadingTarget": "string (örn '20 sayfa')",
  "avoidStarting": ["string"],
  "actionFromBook": "string"
}`

  const userPrompt = `Aktif kitap: ${active}
Tamamlanan kitap: ${body.completedCount ?? 0} / ${body.totalBooks ?? 0}
Kullanıcının isteği: ${body.prompt ?? 'Genel okuma koçluğu ver'}`

  try {
    const raw = await callLight(systemPrompt, userPrompt, 700)
    let clean = raw.trim()
    if (clean.startsWith('```')) clean = clean.replace(/^```json\s*/, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(clean) as Partial<LibraryAdvice>
    // Şema doğrulama + güvenli birleştirme (eksik alanları fallback'tan tamamla).
    return NextResponse.json({
      activeBookAdvice: parsed.activeBookAdvice ?? FALLBACK.activeBookAdvice,
      shouldContinueCurrentBook: parsed.shouldContinueCurrentBook ?? true,
      nextBook: parsed.nextBook ?? null,
      reason: parsed.reason ?? '',
      todayReadingTarget: parsed.todayReadingTarget ?? FALLBACK.todayReadingTarget,
      avoidStarting: Array.isArray(parsed.avoidStarting) ? parsed.avoidStarting : [],
      actionFromBook: parsed.actionFromBook ?? FALLBACK.actionFromBook,
    } satisfies LibraryAdvice)
  } catch (err) {
    console.error('[library-advice]', (err as Error)?.message)
    return NextResponse.json(FALLBACK)
  }
}
