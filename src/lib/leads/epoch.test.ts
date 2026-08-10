import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CURRENT_ACQUISITION_EPOCH,
  LEGACY_ACQUISITION_EPOCH,
  NEVER_TOUCHED_TABLES,
  applyEpochScope,
  currentEpoch,
  planRetirement,
  type EpochCandidate,
} from './epoch'

const ROOT = process.cwd()

function candidate(over: Partial<EpochCandidate> & { id: string }): EpochCandidate {
  return {
    status: 'new',
    acquisitionEpoch: LEGACY_ACQUISITION_EPOCH,
    retiredAt: null,
    hasProject: false,
    hasProposal: false,
    ...over,
  }
}

describe('acquisition epoch — dönem sabitleri', () => {
  it('migration ile TS sabitleri aynı dönem anahtarlarını kullanır', () => {
    // Parite kapısı: sabit burada değişip migration''da değişmezse, uygulama
    // canlıda var olmayan bir döneme filtreler ve HER ekran boş görünür.
    const sql = readFileSync(join(ROOT, 'migrations', '071_acquisition_epoch.sql'), 'utf8')
    expect(sql).toContain(`'${CURRENT_ACQUISITION_EPOCH}'`)
    expect(sql).toContain(`'${LEGACY_ACQUISITION_EPOCH}'`)
    expect(sql).toContain(`set default '${CURRENT_ACQUISITION_EPOCH}'`)
  })

  it('migration hiçbir satırı silmez', () => {
    const sql = readFileSync(join(ROOT, 'migrations', '071_acquisition_epoch.sql'), 'utf8')
    const code = sql.replace(/^\s*--.*$/gm, '').toLowerCase()
    expect(code).not.toMatch(/\bdelete\s+from\b/)
    expect(code).not.toMatch(/\btruncate\b/)
    expect(code).not.toMatch(/\bdrop\s+table\b/)
  })

  it('ortam değişkeni dönem dayatabilir, boşsa kanonik sabite düşer', () => {
    expect(currentEpoch({})).toBe(CURRENT_ACQUISITION_EPOCH)
    expect(currentEpoch({ ACQUISITION_EPOCH: '   ' })).toBe(CURRENT_ACQUISITION_EPOCH)
    expect(currentEpoch({ ACQUISITION_EPOCH: 'epoch-2027-01' })).toBe('epoch-2027-01')
  })
})

describe('planRetirement', () => {
  it('eski dönemdeki bağsız prospect emekliye ayrılır', () => {
    const plan = planRetirement([candidate({ id: 'a' })])
    expect(plan.retire).toEqual([{ id: 'a', action: 'retire', reason: 'legacy-epoch' }])
    expect(plan.preserve).toEqual([])
  })

  it('kazanılmış müşteri, projesi veya teklifi olan lead KORUNUR', () => {
    const plan = planRetirement([
      candidate({ id: 'converted', status: 'converted' }),
      candidate({ id: 'project', hasProject: true }),
      candidate({ id: 'proposal', hasProposal: true }),
    ])
    expect(plan.retire).toEqual([])
    expect(plan.preserve.map((p) => p.reason).sort()).toEqual(['converted', 'has-project', 'has-proposal'])
  })

  it('yeni dönemdeki lead hiç dokunulmaz', () => {
    const plan = planRetirement([candidate({ id: 'fresh', acquisitionEpoch: CURRENT_ACQUISITION_EPOCH })])
    expect(plan.preserve[0].reason).toBe('current-epoch')
  })

  it('IDEMPOTENT: ikinci koşu sıfır emeklilik üretir', () => {
    const rows = [candidate({ id: 'a' }), candidate({ id: 'b' })]
    const first = planRetirement(rows)
    expect(first.retire).toHaveLength(2)

    // İlk koşunun etkisi uygulanmış gibi: retired_at doldu.
    const after = rows.map((r) => ({ ...r, retiredAt: '2026-08-10T00:00:00Z' }))
    const second = planRetirement(after)
    expect(second.retire).toHaveLength(0)
    expect(second.preserve.every((p) => p.reason === 'already-retired')).toBe(true)
  })

  it('rapor neden kırılımı verir, tek toplam değil', () => {
    const plan = planRetirement([
      candidate({ id: 'a' }),
      candidate({ id: 'b' }),
      candidate({ id: 'c', status: 'converted' }),
    ])
    expect(plan.byReason).toEqual({ 'retire:legacy-epoch': 2, 'preserve:converted': 1 })
  })
})

describe('applyEpochScope', () => {
  it('varsayılan kapsam güncel dönem + emekli olmayan', () => {
    const calls: string[] = []
    const q = {
      eq(c: string, v: unknown) { calls.push(`eq:${c}=${String(v)}`); return this },
      is(c: string, v: unknown) { calls.push(`is:${c}=${String(v)}`); return this },
    }
    applyEpochScope(q)
    expect(calls).toEqual([`eq:acquisition_epoch=${CURRENT_ACQUISITION_EPOCH}`, 'is:retired_at=null'])
  })

  it('includeRetired açıkken emeklilik filtresi uygulanmaz', () => {
    const calls: string[] = []
    const q = {
      eq(c: string) { calls.push(`eq:${c}`); return this },
      is(c: string) { calls.push(`is:${c}`); return this },
    }
    applyEpochScope(q, { epoch: LEGACY_ACQUISITION_EPOCH, includeRetired: true })
    expect(calls).toEqual(['eq:acquisition_epoch'])
  })
})

describe('reset aracı — güvenlik sözleşmesi', () => {
  const script = readFileSync(join(ROOT, 'scripts', 'reset-acquisition-epoch.ts'), 'utf8')
  const code = script.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '')

  it('script HİÇBİR silme çağrısı içermez', () => {
    expect(code).not.toMatch(/\.delete\s*\(/)
    expect(code).not.toMatch(/truncate/i)
    expect(code).not.toMatch(/drop\s+table/i)
  })

  it('dokunulmaz tablolara yazma çağrısı yoktur', () => {
    for (const table of NEVER_TOUCHED_TABLES) {
      // Yalnız `.from('<tablo>')` + `.update(`/`.insert(` zinciri aranır; tablo
      // adının rapor metninde geçmesi ihlal değildir.
      const writePattern = new RegExp(`from\\(['"]${table}['"]\\)[^\\n]*\\.(update|insert|upsert)\\(`)
      expect(writePattern.test(code)).toBe(false)
    }
  })

  it('varsayılan mod dry-run', () => {
    expect(script).toContain("let mode: Mode = 'dry-run'")
  })

  it('gerçek müşteri bağı okunamazsa FAIL-CLOSED durur', () => {
    expect(code).toContain('koruma kanıtlanamadığı için işlem durdu')
  })
})
