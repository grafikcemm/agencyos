import { describe, it, expect } from 'vitest'
import {
  CAREER_SKILLS,
  STRATEGIC_INSURANCE_SKILLS,
  BACKLOG_PROJECTS,
  getKaliciSkills,
  getTeknikSkills,
  getAllActiveSkills,
  getNowSkills,
  getAllArchivedSkills,
  getSkillById,
} from './careerRoadmap'

// 2-kart modeli değişmezleri. ONAYLI dağılım tablosunu kilitler.

describe('careerRoadmap — ŞİMDİ (now) cap', () => {
  it('tam 4 beceri "now" (onaylı cap)', () => {
    const now = getNowSkills()
    expect(now).toHaveLength(4)
  })

  it('now seti doğru kimlikler', () => {
    const ids = getNowSkills().map(s => s.id).sort()
    expect(ids).toEqual(
      ['ai-ad-ugc-creative', 'continuous-learning', 'offer-design-productization', 'web-literacy'].sort(),
    )
  })
})

describe('careerRoadmap — kategori/alt-grup değişmezleri', () => {
  it('her teknik becerinin bir alt-grubu var; her kalıcı becerinin yok', () => {
    for (const skill of CAREER_SKILLS) {
      if (skill.category === 'teknik') {
        expect(skill.subgroup, `${skill.id} teknik ama subgroup yok`).toBeDefined()
      } else {
        expect(skill.subgroup, `${skill.id} kalıcı ama subgroup var`).toBeUndefined()
      }
    }
  })

  it('her beceri geçerli bir kategori taşır (hiçbiri türetmeden düşmedi)', () => {
    for (const skill of CAREER_SKILLS) {
      expect(['kalici', 'teknik']).toContain(skill.category)
    }
  })

  it('kart sayıları beklenen değerlerde', () => {
    expect(getKaliciSkills()).toHaveLength(21)
    expect(getTeknikSkills('kreatif')).toHaveLength(9)
    expect(getTeknikSkills('ai_kaldirac')).toHaveLength(9)
    expect(getTeknikSkills('yazilim_temeli')).toHaveLength(6)
    expect(CAREER_SKILLS).toHaveLength(45)
  })
})

describe('careerRoadmap — B3 Yazılım Temeli sıralı yol', () => {
  it('6 adım, order 1..6 benzersiz, web-literacy = Adım 1', () => {
    const b3 = getTeknikSkills('yazilim_temeli')
    expect(b3).toHaveLength(6)
    const orders = b3.map(s => s.order).sort((a, b) => (a ?? 0) - (b ?? 0))
    expect(orders).toEqual([1, 2, 3, 4, 5, 6])
    expect(b3[0].id).toBe('web-literacy')
    expect(b3[0].order).toBe(1)
  })

  it('5 yeni B3 becerisi mevcut', () => {
    const ids = getTeknikSkills('yazilim_temeli').map(s => s.id)
    for (const id of [
      'js-ts-fundamentals',
      'react-nextjs-fundamentals',
      'debugging-skills',
      'sql-supabase-fundamentals',
      'api-auth-fundamentals',
    ]) {
      expect(ids).toContain(id)
    }
  })
})

describe('careerRoadmap — veri kaybı yok', () => {
  it('kimlik çakışması yok (kart + stratejik)', () => {
    const ids = [...CAREER_SKILLS, ...STRATEGIC_INSURANCE_SKILLS].map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('kritik mevcut beceriler korundu', () => {
    for (const id of [
      'after-effects-motion',
      'offer-design-productization',
      'mcp-tool-ecosystem',
      'continuous-learning',
      'web-literacy',
    ]) {
      expect(getSkillById(id), `${id} kayıp`).toBeDefined()
    }
  })

  it('youtube-channel kartlardan çıkarıldı, backlog\'a taşındı', () => {
    expect(CAREER_SKILLS.find(s => s.id === 'youtube-channel')).toBeUndefined()
    expect(BACKLOG_PROJECTS.find(p => p.id === 'youtube-channel')).toBeDefined()
  })

  it('stratejik blok = 5, arşiv = 16 (korundu)', () => {
    expect(STRATEGIC_INSURANCE_SKILLS).toHaveLength(5)
    expect(getAllArchivedSkills()).toHaveLength(16)
  })
})

describe('careerRoadmap — selectorlar', () => {
  it('getAllActiveSkills priority sırasında döner (now önce)', () => {
    const all = getAllActiveSkills()
    const firstNonNow = all.findIndex(s => s.priority !== 'now')
    // İlk 4 "now", sonrası "now" olmamalı.
    expect(firstNonNow).toBe(4)
    expect(all.slice(0, 4).every(s => s.priority === 'now')).toBe(true)
  })

  it('getSkillById stratejik beceriyi de bulur', () => {
    expect(getSkillById('drone-certification')).toBeDefined()
  })
})
