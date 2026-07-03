import { describe, it, expect } from 'vitest'
import { parseDataUri, extractPsiResult } from './psi'

describe('parseDataUri', () => {
  it('jpeg/webp/png data-URI header\'larını çözer', () => {
    expect(parseDataUri('data:image/jpeg;base64,/9j/AAA=')).toEqual({ mime: 'image/jpeg', base64: '/9j/AAA=' })
    expect(parseDataUri('data:image/webp;base64,UklGR===')).toEqual({ mime: 'image/webp', base64: 'UklGR===' })
    expect(parseDataUri('data:image/png;base64,iVBOR')).toEqual({ mime: 'image/png', base64: 'iVBOR' })
  })

  it('geçersiz/boş girdi null döner', () => {
    expect(parseDataUri(undefined)).toBeNull()
    expect(parseDataUri(null)).toBeNull()
    expect(parseDataUri('')).toBeNull()
    expect(parseDataUri('data:text/html;base64,PGh0bWw+')).toBeNull() // yalnız image/*
    expect(parseDataUri('/9j/rawbase64')).toBeNull()
  })
})

describe('extractPsiResult', () => {
  const rawOk = {
    lighthouseResult: {
      finalUrl: 'https://ornek.com/',
      categories: { performance: { score: 0.42 } },
      audits: {
        'largest-contentful-paint': { numericValue: 4321.5 },
        'cumulative-layout-shift': { numericValue: 0.25 },
        'total-blocking-time': { numericValue: 890 },
        'first-contentful-paint': { numericValue: 2100 },
        'speed-index': { numericValue: 5000 },
        'final-screenshot': { details: { data: 'data:image/jpeg;base64,/9j/FAKE=' } },
      },
    },
  }

  it('metrikleri ve screenshot\'ı tipli çıkarır', () => {
    const result = extractPsiResult(rawOk)
    expect(result.ok).toBe(true)
    expect(result.metrics?.performanceScore).toBe(42)
    expect(result.metrics?.lcpMs).toBe(4321.5)
    expect(result.metrics?.cls).toBe(0.25)
    expect(result.screenshot?.mime).toBe('image/jpeg')
    expect(result.finalUrl).toBe('https://ornek.com/')
  })

  it('screenshot audit\'i yoksa screenshot null — kanıt üretilmez', () => {
    const raw = structuredClone(rawOk)
    delete (raw.lighthouseResult.audits as Record<string, unknown>)['final-screenshot']
    const result = extractPsiResult(raw)
    expect(result.ok).toBe(true)
    expect(result.screenshot).toBeNull()
  })

  it('API hatası ok=false döner', () => {
    expect(extractPsiResult({ error: { message: 'Quota exceeded' } }).ok).toBe(false)
    expect(extractPsiResult({}).ok).toBe(false)
  })
})
