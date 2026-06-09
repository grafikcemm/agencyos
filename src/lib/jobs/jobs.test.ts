import { describe, it, expect } from 'vitest'
import {
  mapGreenhouseJobs,
  mapLeverJobs,
  mapAshbyJobs,
  parseWorkableMarkdown,
  parseRecruiteeResponse,
  parseSmartRecruitersResponse,
} from './providers/ats'
import { extractDetailJobs, linkedinGuestTarget, kariyerTarget } from './providers/firecrawl'
import { passesTitle, passesLocation, passesFilter } from './filter'
import { parseJsonObject, toStringArray } from './parse'
import { classifyMarket } from './market'

describe('ATS provider parsers', () => {
  it('greenhouse: absolute_url olmayanları atar, location.name düzleştirir', () => {
    const json = {
      jobs: [
        { id: 1, title: 'Senior Designer', absolute_url: 'https://x.co/1', location: { name: 'Remote' } },
        { id: 2, title: 'No URL', location: { name: 'İstanbul' } },
      ],
    }
    const out = mapGreenhouseJobs(json, 'Acme')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ title: 'Senior Designer', url: 'https://x.co/1', company: 'Acme', source: 'greenhouse', remote: true })
  })

  it('lever: text→title, hostedUrl→url, categories.location', () => {
    const json = [{ id: 'a', text: 'Art Director', hostedUrl: 'https://l.co/a', categories: { location: 'İstanbul' } }]
    const out = mapLeverJobs(json, 'Lev')
    expect(out[0]).toMatchObject({ title: 'Art Director', url: 'https://l.co/a', source: 'lever', remote: false })
  })

  it('lever: dizi değilse boş', () => {
    expect(mapLeverJobs({ not: 'array' }, 'X')).toEqual([])
  })

  it('ashby: isRemote bayrağını okur', () => {
    const json = { jobs: [{ id: 'j', title: 'Motion Designer', jobUrl: 'https://a.co/j', location: 'Anywhere', isRemote: true }] }
    const out = mapAshbyJobs(json, 'Ash')
    expect(out[0]).toMatchObject({ title: 'Motion Designer', remote: true, source: 'ashby' })
  })

  it('workable: markdown tablo satırını ayrıştırır, https/host doğrular', () => {
    const md = [
      '| Title | Dept | Location | Type | x | y | z | Apply |',
      '| UI Designer | Design | İstanbul | Full | a | b | c | [View](https://apply.workable.com/acme/j/123.md) |',
      '| Evil | x | y | z | a | b | c | [View](http://evil.com/x) |',
    ].join('\n')
    const out = parseWorkableMarkdown(md, 'Acme')
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('https://apply.workable.com/acme/j/123')
    expect(out[0].title).toBe('UI Designer')
  })

  it('recruitee: offers[] düzleştirir, host doğrular', () => {
    const json = {
      offers: [
        { id: 1, title: 'Graphic Designer', careers_url: 'https://acme.recruitee.com/o/gd', city: 'İstanbul', country: 'TR' },
        { id: 2, title: 'Bad Host', careers_url: 'https://evil.com/x' },
      ],
    }
    const out = parseRecruiteeResponse(json, 'Acme')
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('https://acme.recruitee.com/o/gd')
  })

  it('smartrecruiters: content[] + ref→public url', () => {
    const json = {
      content: [
        {
          id: '42',
          name: 'Creative Designer',
          ref: 'https://api.smartrecruiters.com/v1/companies/acme/postings/42',
          location: { city: 'İstanbul', country: 'Türkiye', remote: false },
        },
      ],
    }
    const out = parseSmartRecruitersResponse(json, 'Acme')
    expect(out[0].title).toBe('Creative Designer')
    expect(out[0].url).toBe('https://jobs.smartrecruiters.com/acme/postings/42')
  })
})

describe('TR HTML detay-URL parse', () => {
  it('LinkedIn guest HTML: <a> kartları → tekil /jobs/view ilanları, anchor başlığı + slug-at-company', () => {
    const target = linkedinGuestTarget('grafik tasarımcı')
    // LinkedIn guest job-card iskeleti: full-link anchor (sr-only başlık) + arama/feed gürültüsü.
    const html = `
      <ul>
        <li>
          <a class="base-card__full-link"
             href="https://www.linkedin.com/jobs/view/grafik-tasarimci-at-acme-ajans-3812345678?refId=xyz&trackingId=abc">
            <span class="sr-only">Grafik Tasarımcı</span>
          </a>
        </li>
        <li>
          <a class="base-card__full-link"
             href="https://tr.linkedin.com/jobs/view/sosyal-medya-tasarimcisi-at-beta-studio-3899999999"></a>
        </li>
      </ul>
      <a href="https://www.linkedin.com/jobs/search?keywords=grafik">Tüm ilanlar</a>
      <a href="https://www.linkedin.com/feed">Ana sayfa</a>`
    const out = extractDetailJobs(html, target)
    expect(out).toHaveLength(2)
    const first = out.find((j) => j.sourceJobId === '3812345678')!
    expect(first.title).toBe('Grafik Tasarımcı') // anchor sr-only metni tercih edilir
    expect(first.company).toBe('Acme Ajans') // slug'dan -at- ayrımı
    expect(first.url).toBe('https://www.linkedin.com/jobs/view/grafik-tasarimci-at-acme-ajans-3812345678') // tracking strip
    expect(first.source).toBe('firecrawl')
    // anchor metni boş → slug'dan başlık türetilir
    const second = out.find((j) => j.sourceJobId === '3899999999')!
    expect(second.title).toBe('Sosyal Medya Tasarimcisi')
    expect(second.company).toBe('Beta Studio')
  })

  it('LinkedIn: aynı job id iki kez (farklı tracking) → tek ilan (dedup)', () => {
    const target = linkedinGuestTarget('art director')
    const html =
      '<a href="https://www.linkedin.com/jobs/view/x-at-y-3811111111?refId=1">A</a>' +
      '<a href="https://www.linkedin.com/jobs/view/x-at-y-3811111111?refId=2">A</a>'
    expect(extractDetailJobs(html, target)).toHaveLength(1)
  })

  it('kariyer.net HTML: /is-ilani/<slug> anchor → tekil ilan, arama+yanlış host elenir', () => {
    const target = kariyerTarget('https://www.kariyer.net/is-ilanlari/grafik-tasarimci')
    const html = `
      <a href="/is-ilani/kidemli-grafik-tasarimci-12345">Kıdemli Grafik Tasarımcı</a>
      <a href="https://www.kariyer.net/is-ilanlari/grafik-tasarimci">Arama</a>
      <a href="https://evil.com/is-ilani/sahte">Sahte</a>`
    const out = extractDetailJobs(html, target)
    expect(out).toHaveLength(1)
    // kariyer anchor metni kart chrome'u içerir → başlık slug'dan türetilir (titleFromSlug)
    expect(out[0].title).toBe('Kidemli Grafik Tasarimci')
    expect(out[0].url).toBe('https://www.kariyer.net/is-ilani/kidemli-grafik-tasarimci-12345') // göreceli href çözüldü
    expect(out[0].location).toBe('Türkiye')
  })

  it('boş/HTML olmayan girdi → boş dizi', () => {
    const t = kariyerTarget('https://www.kariyer.net/is-ilanlari/x')
    expect(extractDetailJobs('', t)).toEqual([])
    expect(extractDetailJobs('<html>hiç ilan yok</html>', t)).toEqual([])
  })
})

describe('filter', () => {
  it('passesTitle: tasarım rolleri geçer', () => {
    expect(passesTitle('Grafik Tasarımcı')).toBe(true)
    expect(passesTitle('Senior UI/UX Designer')).toBe(true)
    expect(passesTitle('Art Director')).toBe(true)
  })

  it('passesTitle: alakasız/scam roller elenir', () => {
    expect(passesTitle('Backend Software Engineer')).toBe(false)
    expect(passesTitle('Satış Temsilcisi')).toBe(false)
    expect(passesTitle('Genel Müdür')).toBe(false)
  })

  it('passesLocation: remote/İstanbul/boş geçer, yurt dışı zorunlu elenir', () => {
    expect(passesLocation('Berlin, Germany', false)).toBe(false)
    expect(passesLocation('Berlin', true)).toBe(true) // remote her zaman geçer
    expect(passesLocation('İstanbul', false)).toBe(true)
    expect(passesLocation('', false)).toBe(true)
  })

  it('passesFilter: bütünleşik karar', () => {
    expect(passesFilter({ title: 'Sosyal Medya Tasarımcısı', url: 'https://x.co', company: '', location: 'İstanbul', source: 'firecrawl', remote: false }).ok).toBe(true)
    expect(passesFilter({ title: 'DevOps Engineer', url: 'https://x.co', company: '', location: 'İstanbul', source: 'lever', remote: false }).ok).toBe(false)
    expect(passesFilter({ title: '', url: '', company: '', location: '', source: 'x', remote: false }).ok).toBe(false)
  })
})

describe('parse', () => {
  it('parseJsonObject: fence soyup ilk objeyi alır', () => {
    expect(parseJsonObject('```json\n{"fit_score": 80, "fit_reasons": ["a"]}\n```')).toEqual({
      fit_score: 80,
      fit_reasons: ['a'],
    })
  })

  it('parseJsonObject: geçersizde null', () => {
    expect(parseJsonObject('not json')).toBeNull()
    expect(parseJsonObject('{bozuk')).toBeNull()
  })

  it('toStringArray: diziyi temizler ve 6 ile sınırlar', () => {
    expect(toStringArray(['a', '', 'b', null])).toEqual(['a', 'b'])
    expect(toStringArray('x')).toEqual([])
    expect(toStringArray([1, 2, 3, 4, 5, 6, 7, 8])).toHaveLength(6)
  })
})

describe('market', () => {
  it('firecrawl kaynağı her zaman tr', () => {
    expect(classifyMarket('firecrawl', 'Anywhere')).toBe('tr')
    expect(classifyMarket('firecrawl', null)).toBe('tr')
  })

  it('lokasyonda TR sinyali → tr', () => {
    expect(classifyMarket('greenhouse', 'İstanbul, Türkiye')).toBe('tr')
    expect(classifyMarket('lever', 'Remote - Turkey')).toBe('tr')
  })

  it('uluslararası ATS → global', () => {
    expect(classifyMarket('greenhouse', 'San Francisco')).toBe('global')
    expect(classifyMarket('ashby', 'Remote')).toBe('global')
    expect(classifyMarket('lever', null)).toBe('global')
  })
})
