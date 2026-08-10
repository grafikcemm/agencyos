import { describe, it, expect } from 'vitest'
import { describeLifeFlag, lifeUiOwner, showsLifeUi } from './lifeFlags'
import { topItemsFor } from '@/components/layout/Sidebar'

describe('LIFE_UI_OWNER', () => {
  it('varsayılan ve kesin sahip GrafikcemOS', () => {
    expect(lifeUiOwner({})).toBe('cemos')
    expect(showsLifeUi({})).toBe(false)
  })

  it('yalnız tam olarak "cemos" sahipliği devreder', () => {
    expect(lifeUiOwner({ LIFE_UI_OWNER: 'cemos' })).toBe('cemos')
    expect(showsLifeUi({ LIFE_UI_OWNER: 'cemos' })).toBe(false)
  })

  it('eski veya hatalı bayrak değeri AgencyOS yüzeyini geri açmaz', () => {
    for (const v of ['agencyos', 'CEMOS', 'cemos ', 'cemoss', 'true', '1', '']) {
      expect(lifeUiOwner({ LIFE_UI_OWNER: v })).toBe('cemos')
      expect(showsLifeUi({ LIFE_UI_OWNER: v })).toBe(false)
    }
  })

  it('panel özeti değer değil DURUM taşır', () => {
    const d = describeLifeFlag({ LIFE_UI_OWNER: 'cemos' })
    expect(d.key).toBe('LIFE_UI_OWNER')
    expect(d.value).toBe('cemos')
    expect(d.description).toMatch(/Hayat Merkezi/)
  })
})

describe('sidebar kişisel girişleri', () => {
  it('kişisel girişler eski agencyos bayrağında dahi navigasyona dönmez', () => {
    const items = topItemsFor().map((i) => i.href)
    expect(items).not.toContain('/gorevler')
    expect(items).not.toContain('/aliskanliklar')
  })

  it('cemos modunda kişisel girişler DÜŞER, çekirdek kalır', () => {
    const items = topItemsFor().map((i) => i.href)
    expect(items).not.toContain('/gorevler')
    expect(items).not.toContain('/aliskanliklar')
    expect(items).toContain('/command-center')
    expect(items).toContain('/bugun')
  })

  it('üst navigasyon yalnız AgencyOS çekirdeğini taşır', () => {
    expect(topItemsFor().map((i) => i.href)).toEqual(['/command-center', '/bugun'])
  })
})
