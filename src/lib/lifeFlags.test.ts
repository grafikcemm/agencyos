import { describe, it, expect } from 'vitest'
import { describeLifeFlag, lifeUiOwner, showsLifeUi } from './lifeFlags'
import { topItemsFor } from '@/components/layout/Sidebar'

describe('LIFE_UI_OWNER', () => {
  it('varsayılan agencyos — bayrak yoksa bugünkü davranış', () => {
    expect(lifeUiOwner({} as NodeJS.ProcessEnv)).toBe('agencyos')
    expect(showsLifeUi({} as NodeJS.ProcessEnv)).toBe(true)
  })

  it('yalnız tam olarak "cemos" sahipliği devreder', () => {
    expect(lifeUiOwner({ LIFE_UI_OWNER: 'cemos' } as NodeJS.ProcessEnv)).toBe('cemos')
    expect(showsLifeUi({ LIFE_UI_OWNER: 'cemos' } as NodeJS.ProcessEnv)).toBe(false)
  })

  it('YAZIM HATASI sessizce taşıma yapmaz', () => {
    // Kullanicinin gunluk yuzeyinin bir yazim hatasiyla kaybolmasi kabul edilemez.
    for (const v of ['CEMOS', 'cemos ', 'cemoss', 'true', '1', '']) {
      expect(lifeUiOwner({ LIFE_UI_OWNER: v } as NodeJS.ProcessEnv)).toBe('agencyos')
    }
  })

  it('panel özeti değer değil DURUM taşır', () => {
    const d = describeLifeFlag({ LIFE_UI_OWNER: 'cemos' } as NodeJS.ProcessEnv)
    expect(d.key).toBe('LIFE_UI_OWNER')
    expect(d.value).toBe('cemos')
    expect(d.description).toMatch(/Hayat Merkezi/)
  })
})

describe('sidebar kişisel girişleri', () => {
  it('agencyos modunda Aktif Görevler + Alışkanlıklar görünür', () => {
    const items = topItemsFor(true).map((i) => i.href)
    expect(items).toContain('/gorevler')
    expect(items).toContain('/aliskanliklar')
  })

  it('cemos modunda kişisel girişler DÜŞER, çekirdek kalır', () => {
    const items = topItemsFor(false).map((i) => i.href)
    expect(items).not.toContain('/gorevler')
    expect(items).not.toContain('/aliskanliklar')
    expect(items).toContain('/command-center')
    expect(items).toContain('/bugun')
  })

  it('rotalar SILINMEZ — yalnız menüden düşer (404 yok)', () => {
    // Menude olmamasi rotanin olmadigi anlamina GELMEZ; eski yer imleri
    // tasindi ekranina duser. Bu testin kirilmasi, birinin sayfayi silmesi
    // demektir.
    expect(topItemsFor(true).length - topItemsFor(false).length).toBe(2)
  })
})
