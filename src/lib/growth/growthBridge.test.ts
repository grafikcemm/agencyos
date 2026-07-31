import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FORBIDDEN_SNAPSHOT_KEYS, anonId, costBand, findForbiddenSnapshotKeys, mapOutcome,
} from '@/lib/integrations/cemosGrowthData'
import { RecommendationCreate, detectPii } from '@/lib/integrations/cemosGrowthWrite'
import { requireGrowthAuth } from '@/lib/integrations/cemosGrowthAuth'

// RT-A7 — growth köprüsü.
//
// AĞ ÇAĞRISI YOK, DB YAZIMI YOK: saf fonksiyonlar, şema ve kimlik katmanı
// sınanır. Migration metni de bir sözleşme olarak sınanır çünkü SQL elle
// uygulanıyor — yanlış yazılmış bir RLS satırı ancak canlıda fark edilirdi.

const ROOT = join(__dirname, '..', '..', '..')
const SQL = readFileSync(join(ROOT, 'migrations', '067_cemos_recommendations.sql'), 'utf8')
const ROLLBACK = readFileSync(join(ROOT, 'migrations', '067_cemos_recommendations_rollback.sql'), 'utf8')

const req = (headers: Record<string, string> = {}) => new Request('https://x.test/api', { headers })

const ENV_KEYS = [
  'CEMOS_AGENCYOS_READ_TOKEN', 'CEMOS_AGENCYOS_WRITE_TOKEN', 'CEMOS_AGENCYOS_CLIENT_ID',
  'CEMOS_LIFE_READ_TOKEN', 'CEMOS_LIFE_WRITE_TOKEN',
] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

// ─────────────────────────────── kimlik ──────────────────────────────────────

describe('growth kimliği — LIFE`tan BAĞIMSIZ', () => {
  it('token yoksa HER ortamda reddedilir', () => {
    expect(() => requireGrowthAuth(req({ authorization: 'Bearer x'.padEnd(40, 'y') }), 'read'))
      .toThrowError(/yapılandırılmamış/)
  })

  it('bearer başlığı yoksa 401', () => {
    try {
      requireGrowthAuth(req(), 'read')
      throw new Error('reddetmeliydi')
    } catch (e) {
      expect((e as { status: number }).status).toBe(401)
    }
  })

  it('LIFE tokenı growth köprüsünü AÇMAZ', () => {
    process.env.CEMOS_LIFE_READ_TOKEN = 'life-token-1234567890'
    expect(() => requireGrowthAuth(req({ authorization: 'Bearer life-token-1234567890' }), 'read'))
      .toThrowError(/yapılandırılmamış/)
  })

  it('okuma tokenı YAZMA yoluna giremez', () => {
    process.env.CEMOS_AGENCYOS_READ_TOKEN = 'read-token-1234567890'
    process.env.CEMOS_AGENCYOS_WRITE_TOKEN = 'write-token-1234567890'
    try {
      requireGrowthAuth(req({ authorization: 'Bearer read-token-1234567890' }), 'write')
      throw new Error('reddetmeliydi')
    } catch (e) {
      expect((e as { status: number; code: string }).status).toBe(403)
      expect((e as { code: string }).code).toBe('bad_scope')
    }
  })

  it('yazma tokenı okumayı da kapsar', () => {
    process.env.CEMOS_AGENCYOS_WRITE_TOKEN = 'write-token-1234567890'
    process.env.CEMOS_AGENCYOS_CLIENT_ID = 'cemos-test'
    expect(requireGrowthAuth(req({ authorization: 'Bearer write-token-1234567890' }), 'read'))
      .toEqual({ clientId: 'cemos-test' })
  })

  it('yanlış token 403', () => {
    process.env.CEMOS_AGENCYOS_READ_TOKEN = 'read-token-1234567890'
    try {
      requireGrowthAuth(req({ authorization: 'Bearer yanlis-token-000000' }), 'read')
      throw new Error('reddetmeliydi')
    } catch (e) {
      expect((e as { status: number }).status).toBe(403)
    }
  })
})

// ─────────────────────────── PII yüzeyi ──────────────────────────────────────

describe('snapshot — PII taşımaz', () => {
  it('anonim kimlik deterministik ama ham kimliği İÇERMEZ', () => {
    const raw = '9f1c2b7e-0000-4000-8000-000000000001'
    const a = anonId(raw)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(a).toBe(anonId(raw)) // aynı girdi → aynı anahtar (eşleştirme mümkün)
    expect(a).not.toContain(raw.slice(0, 8))
    expect(anonId('baska-id')).not.toBe(a)
  })

  it('yasak alan listesi iletişim bilgisini kapsar', () => {
    for (const k of ['email', 'phone', 'business_name', 'website', 'lead_id']) {
      expect(FORBIDDEN_SNAPSHOT_KEYS).toContain(k)
    }
  })

  it('veri modülü select(*) kullanmaz; ham yanıt yalnız sunucu-içi FSM girdisidir', () => {
    const raw = readFileSync(join(ROOT, 'src', 'lib', 'integrations', 'cemosGrowthData.ts'), 'utf8')
    // Yorumlar çıkarılır: bu dosyanın kendi açıklaması `select('*')` ifadesini
    // örnek olarak İÇERİYOR; onu ihlal saymak testi gürültüye boğardı.
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(src).not.toMatch(/\.select\(\s*['"`]\s*\*/)

    // Sütun adları TAM eşleşmeyle sınanır. Alt dize araması `has_real_website`i
    // "website" sanıp yanlış alarm verirdi — o bir sinyal boole'u, iletişim
    // bilgisi değil.
    const columns = [...src.matchAll(/\.select\(\s*'([^']+)'/g)]
      .flatMap((m) => m[1].split(',').map((c) => c.trim()))
    expect(columns.length).toBeGreaterThan(0)
    for (const forbidden of ['email', 'phone', 'business_name', 'website', 'address', 'notes', 'raw']) {
      expect(columns, forbidden).not.toContain(forbidden)
    }
    expect(columns).toContain('body')
    expect(src).toMatch(/classifyReply/)
  })

  it('payload savunma kapısı body dahil PII anahtarını derinde yakalar', () => {
    expect(FORBIDDEN_SNAPSHOT_KEYS).toContain('body')
    expect(findForbiddenSnapshotKeys({ outcomes: [{ replyClass: 'positive_interest' }] })).toEqual([])
    expect(findForbiddenSnapshotKeys({ outcomes: [{ nested: { body: 'gizli' } }] }))
      .toEqual(['$.outcomes[0].nested.body'])
  })

  it('maliyet BANT olarak çıkar; bilinmeyen sıfır sayılmaz', () => {
    expect(costBand(null)).toBe('unknown')
    expect(costBand(undefined)).toBe('unknown')
    expect(costBand(NaN)).toBe('unknown')
    expect(costBand(0)).toBe('free')
    expect(costBand(4.99)).toBe('0-5')
    expect(costBand(5)).toBe('5-20')
    expect(costBand(21)).toBe('20+')
  })

  it('sonuç eşlemesi kapalı küme; belirsizlik ADIYLA taşınır', () => {
    expect(mapOutcome('sent', null)).toBe('sent')
    expect(mapOutcome('delivered', null)).toBe('sent')
    expect(mapOutcome('reply', null)).toBe('replied')
    expect(mapOutcome('bounce', null)).toBe('bounced')
    expect(mapOutcome('unsubscribed', null)).toBe('opted_out')
    // provider_unknown HER ZAMAN kazanır: gönderildi mi bilmiyoruz.
    expect(mapOutcome('sent', 'provider_unknown')).toBe('unknown')
    expect(mapOutcome('yeni_durum', null)).toBe('pending')
    expect(mapOutcome(undefined, undefined)).toBe('pending')
  })
})

// ─────────────────────────── öneri şeması ────────────────────────────────────

const VALID = {
  kind: 'experiment' as const,
  title: 'Mimarlık nişinde konu satırını kısalt',
  rationale:
    'Son 60 gönderimde uzun konu satırlı varyantın cevap oranı düşük kaldı; örneklem sınırda ama yön tutarlı.',
  proposedChange: 'Konu satırını altı kelimenin altına indir.',
  confidence: 'medium' as const,
  sampleSufficient: false,
}

describe('öneri şeması — strict ve dar', () => {
  it('geçerli öneri kabul edilir', () => {
    expect(RecommendationCreate.safeParse(VALID).success).toBe(true)
  })

  it('BİLİNMEYEN alan reddedilir', () => {
    expect(RecommendationCreate.safeParse({ ...VALID, applyNow: true }).success).toBe(false)
  })

  it('durum GÖNDERİLEMEZ — öneri kendini onaylayamaz', () => {
    expect(RecommendationCreate.safeParse({ ...VALID, status: 'accepted' }).success).toBe(false)
  })

  it('örneklem yeterliliği ZORUNLU alan', () => {
    const { sampleSufficient, ...eksik } = VALID
    void sampleSufficient
    expect(RecommendationCreate.safeParse(eksik).success).toBe(false)
  })

  it('kapalı küme dışındaki tür reddedilir', () => {
    expect(RecommendationCreate.safeParse({ ...VALID, kind: 'her_sey' }).success).toBe(false)
    expect(RecommendationCreate.safeParse({ ...VALID, confidence: 'kesin' }).success).toBe(false)
  })

  it('aşırı uzun metin reddedilir', () => {
    expect(RecommendationCreate.safeParse({ ...VALID, rationale: 'x'.repeat(1001) }).success).toBe(false)
    expect(RecommendationCreate.safeParse({ ...VALID, title: 'kısa' }).success).toBe(false)
  })

  it('İLETİŞİM BİLGİSİ içeren öneri tespit edilir', () => {
    expect(detectPii({ ...VALID, rationale: `${VALID.rationale} deniz@sirket.com ile konuşuldu.` }))
      .toContain('email')
    expect(detectPii({ ...VALID, proposedChange: '+90 555 111 22 33 numarasını ara.' })).toContain('phone')
    expect(detectPii(VALID)).toEqual([])
  })
})

// ───────────────────────── migration 067 sözleşmesi ──────────────────────────

describe('067 — şema sözleşmesi', () => {
  it('iki tablo da IF NOT EXISTS ile oluşturulur', () => {
    for (const t of ['cemos_recommendations', 'cemos_growth_audit']) {
      expect(SQL).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}\\b`))
    }
  })

  it('durum kapalı küme ve DEFAULT proposed', () => {
    expect(SQL).toMatch(/status\s+text NOT NULL DEFAULT 'proposed'/)
    expect(SQL).toMatch(/CHECK \(status IN \('proposed', 'accepted', 'rejected', 'applied'\)\)/)
  })

  it('idempotency anahtarı VERİTABANI seviyesinde tekil', () => {
    expect(SQL).toMatch(/idempotency_key\s+text UNIQUE/)
  })

  it('denetim tablosu GÖVDE saklamaz', () => {
    const blok = SQL.slice(SQL.indexOf('cemos_growth_audit'))
    expect(blok).toMatch(/request_hash/)
    expect(blok).not.toMatch(/request_body|raw_body|payload_json/)
  })

  it('serbest metin uzunlukları SINIRLI', () => {
    expect(SQL).toMatch(/char_length\(title\) BETWEEN 8 AND 120/)
    expect(SQL).toMatch(/char_length\(rationale\) BETWEEN 20 AND 1000/)
  })

  it('RLS açık, policy YOK, anon/authenticated REVOKE', () => {
    for (const t of ['cemos_recommendations', 'cemos_growth_audit']) {
      expect(SQL).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`))
      expect(SQL).toMatch(new RegExp(`REVOKE ALL ON public\\.${t}\\s+FROM anon, authenticated`))
    }
    expect(SQL).not.toMatch(/CREATE POLICY/i)
  })

  it('tek transaction + şema yeniden yükleme', () => {
    expect(SQL).toMatch(/^BEGIN;/m)
    expect(SQL).toMatch(/^COMMIT;/m)
    expect(SQL).toMatch(/NOTIFY pgrst, 'reload schema'/)
  })

  it('mevcut CRM tablolarına DOKUNMAZ', () => {
    for (const t of ['leads', 'contacts', 'proposals', 'outreach_messages']) {
      expect(SQL).not.toMatch(new RegExp(`(DROP|ALTER) TABLE public\\.${t}\\b`))
    }
  })

  it('rollback ikizi VERİ KAYBI ve ön koşulları AÇIKÇA yazar', () => {
    for (const t of ['cemos_recommendations', 'cemos_growth_audit']) {
      expect(ROLLBACK).toMatch(new RegExp(`DROP TABLE IF EXISTS public\\.${t}\\b`))
    }
    expect(ROLLBACK).toMatch(/VERI KAYBI/)
    expect(ROLLBACK).toMatch(/CEMOS_AGENCYOS_WRITE_TOKEN/)
    expect(ROLLBACK).toMatch(/status='proposed'/)
  })

  it('otomatik uygulama YOLU YOK', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const scripts = Object.values(pkg.scripts ?? {}).join(' ')
    expect(scripts).not.toMatch(/db push|migration up|migrate deploy|psql .*067/)
  })
})
