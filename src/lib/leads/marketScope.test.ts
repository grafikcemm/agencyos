import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MARKET_SCOPES,
  TOTAL_PROSPECT_TARGET,
  presetsFor,
  scopeForCountry,
  sendableCountryCount,
  workspaceFor,
} from './marketScope'
import { NICHES } from '@/data/niches'
import { policyFor } from '@/lib/compliance/countryPolicy'

describe('çalışma alanları', () => {
  it('iki alan vardır ve her biri kendi dil/para/saat dilimini taşır', () => {
    expect([...MARKET_SCOPES]).toEqual(['tr', 'global'])
    expect(workspaceFor('tr')).toMatchObject({ language: 'tr', currency: 'TRY', timezone: 'Europe/Istanbul', geoView: 'province' })
    expect(workspaceFor('global')).toMatchObject({ language: 'en', currency: 'USD', timezone: 'UTC', geoView: 'world' })
  })

  it('Türkiye haritası Global yüzeye taşmaz', () => {
    expect(workspaceFor('global').geoView).not.toBe('province')
    expect(workspaceFor('global').countries).not.toContain('TR')
  })

  it('Global kapsamı yalnız politikası yazılmış ülkeleri içerir', () => {
    for (const c of workspaceFor('global').countries) {
      expect(policyFor(c).ceiling).not.toBe('blocked')
    }
  })

  it('aylık prospect hedefi 1.400–1.600 aralığında', () => {
    expect(TOTAL_PROSPECT_TARGET).toBeGreaterThanOrEqual(1400)
    expect(TOTAL_PROSPECT_TARGET).toBeLessThanOrEqual(1600)
  })

  it('bilinmeyen ülke Global\'e düşer, TR\'ye DEĞİL', () => {
    expect(scopeForCountry('TR')).toBe('tr')
    expect(scopeForCountry('tr')).toBe('tr')
    expect(scopeForCountry('US')).toBe('global')
    expect(scopeForCountry(null)).toBe('global')
    expect(scopeForCountry('')).toBe('global')
  })
})

describe('sorgu presetleri', () => {
  it('hiçbir preset dili veya ülkesi sabit "tr" değildir', () => {
    for (const p of presetsFor('global')) {
      expect(p.language).toBe('en')
      expect(p.countries).not.toContain('TR')
    }
  })

  it('TR presetleri korunur ve il bazlıdır', () => {
    const tr = presetsFor('tr')
    expect(tr.length).toBeGreaterThan(0)
    for (const p of tr) {
      expect(p.countries).toEqual(['TR'])
      expect(p.language).toBe('tr')
    }
  })

  it('her preset kanonik bir nişe bağlıdır — serbest sektör uydurulmaz', () => {
    const ids = new Set(NICHES.map((n) => n.id))
    for (const scope of MARKET_SCOPES) {
      for (const p of presetsFor(scope)) {
        expect(ids.has(p.nicheId as never)).toBe(true)
      }
    }
  })

  it('preset kimlikleri benzersiz', () => {
    const all = [...presetsFor('tr'), ...presetsFor('global')].map((p) => p.id)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('gönderim açıklığı özeti', () => {
  it('ham ülke listesi yerine sayı döner', () => {
    expect(sendableCountryCount('tr')).toEqual({ open: 1, total: 1 })
    expect(sendableCountryCount('global')).toEqual({ open: 2, total: 2 })
  })
})

describe('sabit TR varsayımı kaldırıldı', () => {
  const scanSrc = readFileSync(join(process.cwd(), 'src', 'lib', 'leads', 'scan.ts'), 'utf8')
  const scanCode = scanSrc.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '')

  it('Places sorgusu hard-coded language=tr / region=tr taşımaz', () => {
    expect(scanCode).not.toContain('language=tr')
    expect(scanCode).not.toContain('region=tr')
    expect(scanCode).toContain('language=${placesLanguage}')
    expect(scanCode).toContain('region=${placesRegion}')
  })

  it('yalnız telefonu olan işletmeyi kabul etme varsayımı kaldırıldı', () => {
    // Web sitesi olan ama telefonu olmayan marka artık ELENMEZ.
    expect(scanCode).toContain('!hasPhone && !hasWebsite')
    expect(scanCode).not.toContain('!d.formatted_phone_number) { skippedCount++')
  })

  it('tarama pazar kapsamını ve kaynak izini kaydeder', () => {
    for (const key of ['market_scope', 'country_code', 'source_provider', 'source_url', 'acquired_at']) {
      expect(scanCode).toContain(`${key}:`)
    }
  })
})
