import { describe, it, expect } from 'vitest'
import {
  COLD_EMAIL_TEMPLATES,
  selectColdEmailTemplate,
  type ColdEmailTemplateId,
} from './coldEmailTemplates'

const ALL_IDS: ColdEmailTemplateId[] = ['mini_audit', 'launch', 'hiring', 'before_after']

describe('COLD_EMAIL_TEMPLATES', () => {
  it('her id için tanımlı bir şablon var ve id alanı eşleşir', () => {
    for (const id of ALL_IDS) {
      const tpl = COLD_EMAIL_TEMPLATES[id]
      expect(tpl, `şablon "${id}" tanımlı olmalı`).toBeDefined()
      expect(tpl.id).toBe(id)
      expect(tpl.angle.length).toBeGreaterThan(0)
      expect(tpl.skeleton.length).toBeGreaterThan(0)
    }
  })
})

describe('selectColdEmailTemplate', () => {
  it('işe alım sinyali her şeyin önündedir', () => {
    expect(
      selectColdEmailTemplate({ hasJobSignal: true, hasAdsSignal: true, instagramAsSite: true }),
    ).toBe('hiring')
  })

  it('aktif reklam → lansman (işe alım yokken)', () => {
    expect(selectColdEmailTemplate({ hasAdsSignal: true, instagramAsSite: true })).toBe('launch')
  })

  it('Instagram-only veya web yok → before_after', () => {
    expect(selectColdEmailTemplate({ instagramAsSite: true })).toBe('before_after')
    expect(selectColdEmailTemplate({ hasRealWebsite: false })).toBe('before_after')
  })

  it('belirgin sinyal yoksa → mini_audit (default)', () => {
    expect(selectColdEmailTemplate({ hasRealWebsite: true })).toBe('mini_audit')
    expect(selectColdEmailTemplate({})).toBe('mini_audit')
  })
})
