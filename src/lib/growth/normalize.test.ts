import { describe, it, expect } from 'vitest'
import { classifyEmail, cleanText, cleanUrl, domainOf, normalizeLeads, outreachEligible } from './normalize'

// RT-A4 — lead normalizasyonu. Bu dosya bir güvenlik sınırını sınar:
// dışarıdan gelen HER alan burada doğrulanır. Pozitif testler kadar negatifler
// de zorunlu — "temiz veriyle çalışıyor" bir kanıt değildir.

describe('classifyEmail — iş / kişisel / rol ayrımı', () => {
  it('şirket alan adı business sayılır', () => {
    expect(classifyEmail('deniz@aktasmimarlik.com.tr')).toEqual({
      email: 'deniz@aktasmimarlik.com.tr',
      kind: 'business',
    })
  })

  it('ücretsiz posta sağlayıcısı personal sayılır', () => {
    for (const e of ['a@gmail.com', 'b@hotmail.com', 'c@yandex.ru', 'd@proton.me', 'e@mynet.com']) {
      expect(classifyEmail(e).kind).toBe('personal')
    }
  })

  it('ortak kutu adresi role sayılır (info@, bilgi@, satis@)', () => {
    expect(classifyEmail('info@yuceldis.com').kind).toBe('role')
    expect(classifyEmail('bilgi@ornek.com.tr').kind).toBe('role')
    expect(classifyEmail('satis+kampanya@ornek.com').kind).toBe('role')
  })

  it('büyük harf normalize edilir (dedupe bunun üstüne kurulu)', () => {
    expect(classifyEmail('DENIZ@AktasMimarlik.com.TR').email).toBe('deniz@aktasmimarlik.com.tr')
  })
})

describe('classifyEmail — zararlı girdi', () => {
  it('CRLF başlık enjeksiyonu REDDEDİLİR', () => {
    // Bu adres bir e-posta başlığına konsaydı gizli bir Bcc alıcısı doğardı.
    expect(classifyEmail('x@y.com\r\nBcc: kurban@example.com').email).toBeNull()
    expect(classifyEmail('x@y.com\nBcc: k@e.com').kind).toBe('invalid')
  })

  it('boşluk, sekme ve kontrol karakteri REDDEDİLİR', () => {
    expect(classifyEmail('a b@c.com').email).toBeNull()
    expect(classifyEmail('a\tb@c.com').email).toBeNull()
    expect(classifyEmail('a\u0000b@c.com').email).toBeNull()
  })

  it('bozuk yapı reddedilir', () => {
    for (const bad of ['', 'yok', 'a@@b.com', 'a@b', '@b.com', 'a@', '.a@b.com', 'a.@b.com', 'a@-b.com', 'a@b-.com']) {
      expect(classifyEmail(bad).email, bad).toBeNull()
    }
  })

  it('254 karakterden uzun adres reddedilir', () => {
    expect(classifyEmail('a'.repeat(250) + '@bcd.com').email).toBeNull()
  })

  it('Apollo kilitli adresi gerçek adres SAYILMAZ', () => {
    expect(classifyEmail('email_not_unlocked@domain.com').email).toBeNull()
  })

  it('string olmayan değer çökmez', () => {
    for (const v of [null, undefined, 42, {}, [], true]) {
      expect(classifyEmail(v).kind).toBe('invalid')
    }
  })
})

describe('cleanText / cleanUrl / domainOf', () => {
  it('kontrol karakteri ve yön işareti temizlenir', () => {
    expect(cleanText('Ak\u0000ta\u202eş  Mimarlık')).toBe('Ak ta ş Mimarlık')
  })

  it('uzunluk kırpılır (DoS emniyeti)', () => {
    expect(cleanText('x'.repeat(5000))!.length).toBe(200)
  })

  it('javascript: ve data: şemaları REDDEDİLİR', () => {
    expect(cleanUrl('javascript:alert(1)')).toBeNull()
    expect(cleanUrl('data:text/html,<script>')).toBeNull()
    expect(cleanUrl('file:///etc/passwd')).toBeNull()
  })

  it('linkedin alanı zorunlu tutulunca sahte host reddedilir', () => {
    expect(cleanUrl('https://linkedin.com/in/x', 'linkedin.com')).toBeTruthy()
    expect(cleanUrl('https://www.linkedin.com/in/x', 'linkedin.com')).toBeTruthy()
    // Saldırgan alanı: linkedin.com.kotu.tr
    expect(cleanUrl('https://linkedin.com.kotu.tr/in/x', 'linkedin.com')).toBeNull()
  })

  it('domainOf şema/yol/www taşımaz', () => {
    expect(domainOf('https://www.Ornek.com.tr/iletisim')).toBe('ornek.com.tr')
    expect(domainOf('ornek.com')).toBe('ornek.com')
    expect(domainOf('bozuk')).toBeNull()
  })
})

describe('normalizeLeads — kabul, sayaç ve dedupe', () => {
  const dataset = [
    { name: 'Deniz Aktaş', company: 'Aktaş Mimarlık', email: 'deniz@aktasmimarlik.com.tr' },
    { fullName: 'Deniz Aktaş', emailAddress: 'DENIZ@AktasMimarlik.com.tr' }, // duplicate
    { name: 'Murat Şen', company: 'Şen Reklam', email: 'murat@gmail.com' }, // personal
    { name: 'Elif Kara', linkedin: 'https://linkedin.com/in/elifkara' }, // şirket yok
    { name: 'Kötü', email: 'x@y.com\r\nBcc: k@e.com' }, // geçersiz e-posta, başka kimlik yok
    'metin değil',
  ]

  it('sayaçlar migration 066 alan adlarıyla birebir', () => {
    const r = normalizeLeads(dataset)
    expect(r.metrics).toEqual({
      receivedCount: 6,
      acceptedCount: 3,
      invalidCount: 2,
      duplicateCount: 1,
      missingCompanyCount: 1,
      missingDecisionMakerCount: 0,
    })
  })

  it('dedupe sırası: email > linkedin > ad+alan adı', () => {
    const r = normalizeLeads([
      { name: 'A', email: 'a@sirket.com', linkedin: 'https://linkedin.com/in/a', company_domain: 'sirket.com' },
      { name: 'B', linkedin: 'https://linkedin.com/in/b', company_domain: 'sirket.com' },
      { name: 'C', company_domain: 'sirket.com' },
    ])
    expect(r.leads.map((l) => l.identityBasis)).toEqual(['email', 'linkedin', 'name_domain'])
  })

  it('aynı LinkedIn iki kez gelirse ikincisi duplicate', () => {
    const r = normalizeLeads([
      { name: 'A', linkedin: 'https://linkedin.com/in/a' },
      { name: 'A farklı yazım', linkedin: 'https://LinkedIn.com/in/a' },
    ])
    expect(r.metrics.acceptedCount).toBe(1)
    expect(r.metrics.duplicateCount).toBe(1)
  })

  it('reddedilenler sıra numarası + kapalı küme sebep taşır, İÇERİK taşımaz', () => {
    const r = normalizeLeads(dataset)
    expect(r.rejects).toContainEqual({ index: 1, reason: 'duplicate' })
    expect(r.rejects).toContainEqual({ index: 4, reason: 'invalid_email' })
    expect(r.rejects).toContainEqual({ index: 5, reason: 'not_an_object' })
    // Sebep dizesi hiçbir e-posta/isim taşımamalı.
    for (const rj of r.rejects) expect(JSON.stringify(rj)).not.toMatch(/@|Deniz|Kötü/)
  })
})

describe('normalizeLeads — outreach yetkisi', () => {
  it('KİŞİSEL adres otomatik diziye GİREMEZ ama kayıt DÜŞMEZ', () => {
    const r = normalizeLeads([{ name: 'Murat', email: 'murat@gmail.com' }])
    expect(r.metrics.acceptedCount).toBe(1)
    expect(r.leads[0].emailKind).toBe('personal')
    expect(r.leads[0].outreachEligible).toBe(false)
    expect(outreachEligible(r)).toHaveLength(0)
  })

  it('iş ve rol adresi diziye girebilir', () => {
    const r = normalizeLeads([
      { name: 'A', email: 'a@sirket.com' },
      { name: 'B', email: 'info@sirket2.com' },
    ])
    expect(outreachEligible(r).map((l) => l.emailKind)).toEqual(['business', 'role'])
  })

  it('e-postasız kayıt (yalnız LinkedIn) diziye giremez', () => {
    const r = normalizeLeads([{ name: 'Elif', linkedin: 'https://linkedin.com/in/elifkara' }])
    expect(r.leads[0].outreachEligible).toBe(false)
  })

  it('rol adresi missingDecisionMaker sayılır', () => {
    const r = normalizeLeads([{ name: 'B', email: 'info@sirket2.com' }])
    expect(r.metrics.missingDecisionMakerCount).toBe(1)
  })
})

describe('normalizeLeads — şema kayması ve zararlı değer', () => {
  it('BİLİNMEYEN alanlar çıktıya sızmaz, çökme de olmaz', () => {
    const r = normalizeLeads([
      { name: 'A', email: 'a@sirket.com', apifyInternalScore: 0.9, __proto__: { polluted: true }, nested: { x: [1, 2] } },
    ])
    expect(r.metrics.acceptedCount).toBe(1)
    expect(Object.keys(r.leads[0]).sort()).toEqual(
      [
        'city', 'companyDomain', 'companyName', 'country', 'dedupeKey', 'email', 'emailKind',
        'fullName', 'identityBasis', 'linkedinUrl', 'outreachEligible', 'sourceHash', 'title', 'websiteUrl',
      ].sort(),
    )
  })

  it('TELEFON hiçbir koşulda taşınmaz', () => {
    const r = normalizeLeads([{ name: 'A', email: 'a@sirket.com', phone: '+90 555 000 00 00', phone_number: '555' }])
    expect(JSON.stringify(r.leads[0])).not.toContain('555')
    expect('phone' in r.leads[0]).toBe(false)
  })

  it('HAM payload saklanmaz — yalnız sha256 parmak izi', () => {
    const r = normalizeLeads([{ name: 'A', email: 'a@sirket.com', secret_note: 'gizli-metin' }])
    expect(r.leads[0].sourceHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(r.leads[0])).not.toContain('gizli-metin')
  })

  it('sağlayıcı alanı yeniden adlandırırsa motor ÇÖKMEZ, sayaç düşer', () => {
    // Şema kayması: e-posta alanı 'e_mail' oldu (tanınmıyor).
    const r = normalizeLeads([{ name: 'A', e_mail: 'a@sirket.com' }, { name: 'B', e_mail: 'b@sirket.com' }])
    expect(r.metrics.receivedCount).toBe(2)
    expect(r.metrics.acceptedCount).toBe(0)
    expect(r.rejects.every((x) => x.reason === 'no_identity')).toBe(true)
  })

  it('BOŞ veri kümesi hata değil', () => {
    const r = normalizeLeads([])
    expect(r.metrics).toMatchObject({ receivedCount: 0, acceptedCount: 0 })
    expect(r.rejects).toHaveLength(0)
  })

  it('dizi olmayan girdi güvenli boş sonuç verir', () => {
    for (const v of [null, undefined, 'metin', 42, { a: 1 }]) {
      expect(normalizeLeads(v).metrics.receivedCount).toBe(0)
    }
  })

  it('prototype kirletme denemesi Object.prototype`a dokunmaz', () => {
    normalizeLeads([JSON.parse('{"name":"A","email":"a@b.com","__proto__":{"kirli":true}}')])
    expect(({} as Record<string, unknown>).kirli).toBeUndefined()
  })
})
