import { describe, it, expect, vi } from 'vitest'

// Canlı judge provider'ı CI'da GERÇEK model çağırmaz — openrouter mock'lanır;
// yalnız kablolama (operation adı + prompt geçişi) doğrulanır.
vi.mock('@/lib/openrouter', () => ({
  callWithOperation: async (op: string, _sys: string, user: string) => ({
    content: JSON.stringify({ scores: [5, 5, 5, 5, 5], gerekce: [op, user.slice(0, 10)], toplamGecerMi: true }),
  }),
}))
import { PERSUASION_MATRIX } from './persuasionMatrix'
import { JUDGE_CI_CASE_IDS, JUDGE_FIXTURES } from './judgeFixtures'
import { fixtureProvider, parseJudgeOutput, resolveJudgeProvider, runJudgeEval } from './persuasionJudge'

// FINALIZATION Faz 2 — judge OFFLINE CI eval runner'ı: buildJudgePrompt her
// koşuda GERÇEKTEN kurulur ve fixture provider üzerinden değerlendirilir
// (canlı model CI'da çağrılmaz; fixture'lar 'pending human calibration').

describe('judge CI eval runner (fixture provider)', () => {
  const ciCases = PERSUASION_MATRIX.filter((c) => JUDGE_CI_CASE_IDS.includes(c.id))

  it('CI alt-kümesi matriste birebir bulunur ve 6 başarısızlık sınıfını kapsar', () => {
    expect(ciCases).toHaveLength(JUDGE_CI_CASE_IDS.length)
    const modes = new Set(ciCases.filter((c) => !c.expectPass).map((c) => c.id.split('-BAD-')[1]))
    expect([...modes].sort()).toEqual(
      ['asiri_uzunluk', 'klise', 'manipulasyon', 'rol_uyumsuz', 'sahte_aciliyet', 'uydurma_iddia'].sort(),
    )
  })

  it('runner: prompt kurulur, fixture kararları parse edilir, deterministik beklentiyle uyuşur', async () => {
    const summary = await runJudgeEval(ciCases, fixtureProvider())
    expect(summary.results).toHaveLength(ciCases.length)
    expect(summary.results.every((r) => r.source === 'fixture')).toBe(true)
    expect(summary.results.every((r) => r.scores.length === 5)).toBe(true)
    // Judge (fixture) kararı ile deterministik katman AYNI yönde:
    expect(summary.disagreements).toEqual([])
  })

  it('fixture eksikse runner AÇIK hata verir (sessiz geçiş yok)', async () => {
    const unknown = PERSUASION_MATRIX.find((c) => !JUDGE_CI_CASE_IDS.includes(c.id))!
    await expect(runJudgeEval([unknown], fixtureProvider())).rejects.toThrow(/fixture eksik/)
  })

  it('provider çözümü: live bayrağı + key varken canlı provider (mock openrouter) seçilir ve çalışır', async () => {
    const prevLive = process.env.PERSUASION_JUDGE_LIVE
    const prevKey = process.env.OPENROUTER_API_KEY
    process.env.PERSUASION_JUDGE_LIVE = '1'
    process.env.OPENROUTER_API_KEY = 'test-key-not-real'
    try {
      const p = await resolveJudgeProvider()
      expect(p.kind).toBe('live')
      const raw = await p.call('YALNIZ JSON döndür' + '\n' + 'GÖVDE:' + '\n' + 'test', 'case-x')
      const parsed = parseJudgeOutput(raw)
      expect(parsed?.toplamGecerMi).toBe(true)
      expect(parsed?.gerekce[0]).toBe('persuasion_judge')
    } finally {
      if (prevLive === undefined) delete process.env.PERSUASION_JUDGE_LIVE
      else process.env.PERSUASION_JUDGE_LIVE = prevLive
      if (prevKey === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = prevKey
    }
  })

  it('provider çözümü: CI ortamında (live bayrağı yok) fixture seçilir', async () => {
    const before = process.env.PERSUASION_JUDGE_LIVE
    delete process.env.PERSUASION_JUDGE_LIVE
    const p = await resolveJudgeProvider()
    expect(p.kind).toBe('fixture')
    if (before !== undefined) process.env.PERSUASION_JUDGE_LIVE = before
  })
})

describe('parseJudgeOutput', () => {
  it('temiz JSON + markdown fence parse edilir', () => {
    const ok = parseJudgeOutput('```json\n{"scores":[5,4,5,5,5],"gerekce":["iyi"],"toplamGecerMi":true}\n```')
    expect(ok?.toplamGecerMi).toBe(true)
    expect(ok?.scores).toEqual([5, 4, 5, 5, 5])
  })

  it('bozuk/eksik çıktı: null (skor sayısı, aralık, tip kontrolleri)', () => {
    expect(parseJudgeOutput('serbest metin')).toBeNull()
    expect(parseJudgeOutput('{"scores":[5,4],"toplamGecerMi":true}')).toBeNull()
    expect(parseJudgeOutput('{"scores":[5,4,5,5,9],"toplamGecerMi":true}')).toBeNull()
    expect(parseJudgeOutput('{"scores":[5,4,5,5,5],"toplamGecerMi":"evet"}')).toBeNull()
  })

  it('gerekce dizisi olmayanlar boş diziye normalize edilir', () => {
    const r = parseJudgeOutput('{"scores":[3,3,3,3,3],"gerekce":"tek","toplamGecerMi":false}')
    expect(r?.gerekce).toEqual([])
  })
})

describe('fixture kayıtları tutarlılık', () => {
  it('her fixture 5 skorlu ve karar alanlı; GOOD kayıtlar geçer, BAD kayıtlar kalır', () => {
    for (const [id, fx] of Object.entries(JUDGE_FIXTURES)) {
      expect(fx.scores).toHaveLength(5)
      expect(fx.toplamGecerMi).toBe(id.endsWith('-GOOD'))
    }
  })
})
