// POST /api/jobs/ingest — manuel ilan girişi (Faz 2 v1: Instagram ajansisleri.ilan).
//
// Instagram scrape bot-engeli yüzünden güvenilmez; bunun yerine operatör IG gönderi
// metnini + URL'sini yapıştırır. İlan source='instagram_ajansisleri' ile job_listings'e
// normalize edilir ve AYNI pipeline'a girer (job_evaluator → legitimacy → writer);
// ajans kaynağı olduğundan scoring.ts fit bonusu otomatik uygulanır.
import { NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { ingestJob } from '@/lib/jobs/scan'
import type { RawJob } from '@/lib/jobs/types'

const INSTAGRAM_SOURCE = 'instagram_ajansisleri'
const MAX_TITLE_LEN = 200
const MAX_DESC_LEN = 4000

// SSRF + çöp koruması: yalnız https instagram.com gönderi URL'leri.
function isValidInstagramUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && /(^|\.)instagram\.com$/i.test(u.hostname)
  } catch {
    return false
  }
}

function deriveTitle(title: unknown, text: string): string {
  if (typeof title === 'string' && title.trim()) return title.trim().slice(0, MAX_TITLE_LEN)
  const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean)
  return (firstLine || 'İlan').slice(0, MAX_TITLE_LEN)
}

export async function POST(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const body = await req.json().catch(() => ({}))
    const url = typeof body.url === 'string' ? body.url.trim() : ''
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    const company = typeof body.company === 'string' ? body.company.trim() : ''

    if (url.length > 2048) {
      return NextResponse.json({ error: 'URL çok uzun' }, { status: 400 })
    }
    if (!isValidInstagramUrl(url)) {
      return NextResponse.json({ error: 'Geçerli bir instagram.com gönderi URL’si zorunludur' }, { status: 400 })
    }
    if (!text && (typeof body.title !== 'string' || !body.title.trim())) {
      return NextResponse.json({ error: 'İlan metni (text) veya başlık (title) zorunludur' }, { status: 400 })
    }

    const title = deriveTitle(body.title, text)
    const job: RawJob = {
      title,
      url,
      company: company || '',
      location: 'Türkiye',
      source: INSTAGRAM_SOURCE,
      remote: /\bremote\b|uzaktan|hibrit|hybrid/i.test(`${title} ${text}`),
      description: text ? text.slice(0, MAX_DESC_LEN) : null,
      employmentType: null,
      postedAt: null,
    }

    const result = await ingestJob(job)
    if (result.error && !result.inserted) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    if (result.duplicate) {
      return NextResponse.json({ success: true, duplicate: true, message: 'Bu URL zaten kayıtlı' })
    }
    return NextResponse.json({ success: true, listingId: result.listingId, enqueued: result.enqueued })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    console.error('Job ingest error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
