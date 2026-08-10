import { describe, it, expect } from 'vitest'
import { classifyTitle, passesFilter, summarizeRejections, passesTitle } from './filter'
import type { RawJob } from './types'

function job(partial: Partial<RawJob>): RawJob {
  return {
    title: 'Grafik Tasarımcı',
    url: 'https://example.com/1',
    company: 'X',
    location: 'İstanbul',
    remote: false,
    ...partial,
  } as RawJob
}

describe('classifyTitle — eleme nedeni görünür', () => {
  it('DENY ile elenen ilanın HANGİ kelimeyle elendiğini söyler', () => {
    const r = classifyTitle('Senior Software Engineer')
    expect(r.ok).toBe(false)
    expect(r.code).toBe('deny_keyword')
    expect(r.matchedKeyword).toBe('software engineer')
  })

  it('ALLOW kelimesi olmayan ilanı ayrı kodla eler', () => {
    const r = classifyTitle('Depo Sorumlusu')
    expect(r.ok).toBe(false)
    expect(r.code).toBe('no_allow_keyword')
    expect(r.matchedKeyword).toBeUndefined()
  })

  it('geçen ilanda eşleşen ALLOW kelimesini bildirir', () => {
    const r = classifyTitle('Kıdemli UI/UX Tasarımcı')
    expect(r.ok).toBe(true)
    expect(r.matchedKeyword).toBeTruthy()
  })

  it('DENY, ALLOW dan ÖNCE gelir — mevcut davranış korunur', () => {
    // "frontend developer" hem DENY hem içinde ALLOW kelimesi barındırmaz,
    // ama "creative software engineer" ikisini de taşır: DENY kazanmalı.
    expect(classifyTitle('Creative Software Engineer').ok).toBe(false)
  })

  it('passesTitle geri uyumlu — davranış değişmedi', () => {
    expect(passesTitle('Grafik Tasarımcı')).toBe(true)
    expect(passesTitle('Backend Developer')).toBe(false)
    expect(passesTitle('Depo Sorumlusu')).toBe(false)
  })
})

describe('passesFilter kodları', () => {
  it('eksik alan', () => {
    expect(passesFilter(job({ title: '' })).code).toBe('missing_fields')
    expect(passesFilter(job({ url: '' })).code).toBe('missing_fields')
  })

  it('yurt dışı konum', () => {
    const r = passesFilter(job({ location: 'Berlin, Germany', remote: false }))
    expect(r.ok).toBe(false)
    expect(r.code).toBe('location_foreign')
  })

  it('remote her konumu geçirir', () => {
    expect(passesFilter(job({ location: 'Berlin, Germany', remote: true })).ok).toBe(true)
  })
})

describe('summarizeRejections — kural değiştirmeden ÖNCE ölçüm', () => {
  it('kod bazında sayar ve en çok eleyen DENY kelimelerini sıralar', () => {
    const results = [
      classifyTitle('Software Engineer'),
      classifyTitle('Senior Software Engineer'),
      classifyTitle('Backend Developer'),
      classifyTitle('Depo Sorumlusu'),
      classifyTitle('Grafik Tasarımcı'),
    ]
    const s = summarizeRejections(results)

    expect(s.byCode.deny_keyword).toBe(3)
    expect(s.byCode.no_allow_keyword).toBe(1)
    expect(s.totalRejected).toBe(4)
    expect(s.topDenyKeywords[0]).toEqual({ keyword: 'software engineer', count: 2 })
  })

  it('hiç eleme yoksa sıfır döner, patlamaz', () => {
    const s = summarizeRejections([classifyTitle('Grafik Tasarımcı')])
    expect(s.totalRejected).toBe(0)
    expect(s.topDenyKeywords).toEqual([])
  })

  it('geçen sonuçları saymaz', () => {
    const s = summarizeRejections([{ ok: true }, { ok: true }])
    expect(s.totalRejected).toBe(0)
  })
})

describe('ölçüm kararı — Creative Technologist rotası', () => {
  it('yeni rotaya UYGUN roller bugün DENY ile eleniyor (ölçülen gerçek)', () => {
    // Bu test bir HATA raporu değil, bir ÖLÇÜM: Cem'in yeni kariyer rotası
    // (Creative Technologist / Product & Automation Builder) bu başlıkları
    // hedefliyor ama filtre bugün hepsini eliyor. Kural DEĞİŞTİRİLMEDEN önce
    // gerçek bir tarama koşusunda kaç ilan olduğu görülmeli.
    for (const title of [
      'Frontend Developer',
      'Software Engineer',
      'Full Stack Engineer',
    ]) {
      const r = classifyTitle(title)
      expect(r.ok, `${title} bugün eleniyor`).toBe(false)
      expect(r.code).toBe('deny_keyword')
    }
  })

  it('kreatif-teknik melez başlıklar ZATEN geçiyor — kural kaldırmak şart değil', () => {
    for (const title of [
      'Creative Technologist',
      'Product Designer',
      'UI Engineer',
      'Design Engineer',
      'Motion Designer',
    ]) {
      expect(classifyTitle(title).ok, `${title} geçmeli`).toBe(true)
    }
  })
})
