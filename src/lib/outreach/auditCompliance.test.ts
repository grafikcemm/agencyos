import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tablo-yönlendirmeli supabase mock'u — suppression_list/settings sorguları.
const tableData: Record<string, unknown[]> = { suppression_list: [], settings: [] }
let suppressionThrows = false
let suppressionRejectsRaw = false // Error olmayan rejection (msg dalı)
let domainScopeErrors = false // yalnız scope='domain' sorgusu hata verir
let domainScopeNullData = false // scope='domain' → { data:null, error:null }
let settingsThrows = false

function makeQuery(table: string) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = []
  let scopeVal: unknown = null
  const obj: Record<string, unknown> = {}
  const chain = () => obj
  Object.assign(obj, {
    select: chain,
    eq: (col: string, val: unknown) => {
      if (col === 'scope') scopeVal = val
      filters.push((r) => r[col] === val); return obj
    },
    ilike: (col: string, val: string) => {
      filters.push((r) => String(r[col]).toLowerCase() === val.toLowerCase()); return obj
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col])); return obj
    },
    limit: chain,
    maybeSingle: async () => {
      if (table === 'settings' && settingsThrows) throw new Error('settings down')
      if (table === 'suppression_list' && suppressionThrows) return { data: null, error: { message: 'db down' } }
      const rows = (tableData[table] ?? []).filter((r) => filters.every((f) => f(r as Record<string, unknown>)))
      return { data: rows[0] ?? null, error: null }
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      if (table === 'suppression_list' && suppressionRejectsRaw) {
        return Promise.reject('raw db down').then(resolve, reject)
      }
      if (table === 'suppression_list' && suppressionThrows) {
        return Promise.resolve({ data: null, error: { message: 'db down' } }).then(resolve, reject)
      }
      if (table === 'suppression_list' && scopeVal === 'domain' && domainScopeErrors) {
        return Promise.resolve({ data: null, error: { message: 'domain sorgusu down' } }).then(resolve, reject)
      }
      if (table === 'suppression_list' && scopeVal === 'domain' && domainScopeNullData) {
        return Promise.resolve({ data: null, error: null }).then(resolve, reject)
      }
      const rows = (tableData[table] ?? []).filter((r) => filters.every((f) => f(r as Record<string, unknown>)))
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
    },
  })
  return obj
}
vi.mock('../supabase', () => ({ supabaseAdmin: { from: (table: string) => makeQuery(table) } }))

import { checkComplianceStatic, isSuppressed, auditCompliance, getSuppressedSet, extractDomain, OPT_OUT_MARKER } from './auditCompliance'

const VALID_BODY = `Merhaba,\n\ndeğer önerisi...\n\n—\nGrafikcem | MERSİS: 123\nBu ileti B2B ticari ileti niteliğindedir.\nBu tür e-postaları almak istemezseniz "ret" yazarak ${OPT_OUT_MARKER}.`

beforeEach(() => {
  tableData.suppression_list = []
  tableData.settings = []
  suppressionThrows = false
  suppressionRejectsRaw = false
  domainScopeErrors = false
  domainScopeNullData = false
  settingsThrows = false
})

describe('checkComplianceStatic (T8 deterministik, LLM yok)', () => {
  it('geçerli alıcı + footer\'lı gövde → ok', () => {
    const r = checkComplianceStatic({ toAddress: 'info@klinik.com', body: VALID_BODY, complianceEnabled: true })
    expect(r.ok).toBe(true)
  })
  it('opt-out footer eksik → bloke', () => {
    const r = checkComplianceStatic({ toAddress: 'info@klinik.com', body: 'Merhaba, footer yok.', complianceEnabled: true })
    expect(r.ok).toBe(false)
    expect(r.failures).toContain('optout_footer_eksik')
  })
  it('compliance kapalıysa footer zorunlu değil', () => {
    const r = checkComplianceStatic({ toAddress: 'info@klinik.com', body: 'Footer yok ama uyum kapalı.', complianceEnabled: false })
    expect(r.ok).toBe(true)
  })
  it('geçersiz alıcı → bloke', () => {
    const r = checkComplianceStatic({ toAddress: 'gecersiz-adres', body: VALID_BODY, complianceEnabled: true })
    expect(r.failures).toContain('gecersiz_alici_adresi')
  })
  it('do_not_contact işaretli lead → bloke', () => {
    const r = checkComplianceStatic({ toAddress: 'info@klinik.com', body: VALID_BODY, complianceEnabled: true, doNotContact: true })
    expect(r.failures).toContain('lead_do_not_contact')
  })
  it('extractDomain: adresi domain\'e indirger', () => {
    expect(extractDomain('Info@Klinik.COM')).toBe('klinik.com')
    expect(extractDomain('bozuk')).toBeNull()
    expect(extractDomain(null)).toBeNull()
    expect(extractDomain('sonda@')).toBeNull() // '@' var ama domain boş
  })

  it('boş gövde → bos_govde (footer kontrolünden ÖNCE)', () => {
    const r = checkComplianceStatic({ toAddress: 'info@klinik.com', body: '   ', complianceEnabled: true })
    expect(r.failures).toContain('bos_govde')
    expect(r.failures).not.toContain('optout_footer_eksik')
  })
})

describe('isSuppressed (mig 047 pre-send gate)', () => {
  it('listede olmayan adres → suppressed:false', async () => {
    expect((await isSuppressed('temiz@ornek.com')).suppressed).toBe(false)
  })
  it('email scope eşleşmesi → suppressed:true', async () => {
    tableData.suppression_list = [{ id: '1', scope: 'email', address: 'yasak@ornek.com', reason: 'opt_out' }]
    const v = await isSuppressed('YASAK@ornek.com')
    expect(v.suppressed).toBe(true)
    expect(v.reason).toContain('opt_out')
  })
  it('domain scope eşleşmesi → suppressed:true', async () => {
    tableData.suppression_list = [{ id: '2', scope: 'domain', address: 'yasakdomain.com', reason: 'complaint' }]
    expect((await isSuppressed('herkes@yasakdomain.com')).suppressed).toBe(true)
  })
  it('DB hatasında FAIL-CLOSED: suppressed:true (kapı atlanamaz)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    suppressionThrows = true
    const v = await isSuppressed('biri@ornek.com')
    expect(v.suppressed).toBe(true)
    expect(v.reason).toContain('fail_closed')
    errSpy.mockRestore()
  })

  it('domain\'siz adres: domain sorgusu ATLANIR, email scope sonucu döner', async () => {
    expect((await isSuppressed('bozukadres')).suppressed).toBe(false)
  })

  it('YALNIZ domain sorgusu hata verirse de FAIL-CLOSED', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    domainScopeErrors = true
    const v = await isSuppressed('biri@ornek.com')
    expect(v.suppressed).toBe(true)
    expect(v.reason).toContain('fail_closed')
    errSpy.mockRestore()
  })

  it('Error olmayan rejection\'da da FAIL-CLOSED (mesaj dalı)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    suppressionRejectsRaw = true
    const v = await isSuppressed('biri@ornek.com')
    expect(v.suppressed).toBe(true)
    errSpy.mockRestore()
  })
})

describe('getSuppressedSet (Faz 2.4 toplu kapı — isSuppressed ile aynı semantik)', () => {
  it('boş girdi → boş set, DB turu yok', async () => {
    expect((await getSuppressedSet([])).size).toBe(0)
  })

  it('email scope eşleşmesi set\'e girer; temiz adres girmez (normalize: trim+lowercase)', async () => {
    tableData.suppression_list = [{ id: '1', scope: 'email', address: 'yasak@ornek.com', reason: 'opt_out' }]
    const set = await getSuppressedSet(['  YASAK@ornek.com ', 'temiz@ornek.com'])
    expect(set.has('yasak@ornek.com')).toBe(true)
    expect(set.has('temiz@ornek.com')).toBe(false)
    expect(set.size).toBe(1)
  })

  it('domain scope: domain\'i yasaklı TÜM adresler bloklanır', async () => {
    tableData.suppression_list = [{ id: '2', scope: 'domain', address: 'yasakdomain.com', reason: 'complaint' }]
    const set = await getSuppressedSet(['a@yasakdomain.com', 'b@yasakdomain.com', 'c@serbest.com'])
    expect(set.has('a@yasakdomain.com')).toBe(true)
    expect(set.has('b@yasakdomain.com')).toBe(true)
    expect(set.has('c@serbest.com')).toBe(false)
  })

  it('domain\'siz (bozuk) adres domain sorgusunu tetiklemez; email scope yine çalışır', async () => {
    tableData.suppression_list = [{ id: '3', scope: 'email', address: 'bozukadres', reason: 'manual' }]
    const set = await getSuppressedSet(['bozukadres'])
    expect(set.has('bozukadres')).toBe(true)
  })

  it('DB hatasında FAIL-CLOSED: TÜM adresler suppressed sayılır (kapı atlanamaz)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    suppressionThrows = true
    const set = await getSuppressedSet(['a@x.com', 'b@y.com'])
    expect(set.has('a@x.com')).toBe(true)
    expect(set.has('b@y.com')).toBe(true)
    expect(set.size).toBe(2)
    errSpy.mockRestore()
  })

  it('YALNIZ domain sorgusu hata verirse de FAIL-CLOSED (tümü bloklu)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    domainScopeErrors = true
    const set = await getSuppressedSet(['a@x.com'])
    expect(set.has('a@x.com')).toBe(true)
    errSpy.mockRestore()
  })

  it('domain sorgusu null-data dönerse (?? []) çökmeden temiz sonuç', async () => {
    domainScopeNullData = true
    const set = await getSuppressedSet(['a@x.com'])
    expect(set.size).toBe(0)
  })

  it('karışık: domain\'siz TEMİZ adres + domain\'li adres — d?:false dalı', async () => {
    tableData.suppression_list = [{ id: '9', scope: 'domain', address: 'yasak.com', reason: 'x' }]
    const set = await getSuppressedSet(['bozuktemiz', 'a@yasak.com'])
    expect(set.has('a@yasak.com')).toBe(true)
    expect(set.has('bozuktemiz')).toBe(false)
  })
})

describe('auditCompliance (tam kapı)', () => {
  it('temiz adres + geçerli gövde → ok', async () => {
    const r = await auditCompliance({ toAddress: 'temiz@ornek.com', body: VALID_BODY })
    expect(r.ok).toBe(true)
  })
  it('suppress edilmiş adres → bloke + neden', async () => {
    tableData.suppression_list = [{ id: '1', scope: 'email', address: 'yasak@ornek.com', reason: 'opt_out' }]
    const r = await auditCompliance({ toAddress: 'yasak@ornek.com', body: VALID_BODY })
    expect(r.ok).toBe(false)
    expect(r.failures.some((f) => f.includes('suppression'))).toBe(true)
  })

  it('geçersiz adres → suppression sorgusu ATLANIR (yalnız statik hata)', async () => {
    const r = await auditCompliance({ toAddress: 'bozuk-adres', body: VALID_BODY })
    expect(r.ok).toBe(false)
    expect(r.failures).toEqual(['gecersiz_alici_adresi'])
  })

  it('settings compliance_enabled=false → footer\'sız gövde geçer', async () => {
    tableData.settings = [{ key: 'compliance_enabled', value: 'false' }]
    const r = await auditCompliance({ toAddress: 'info@klinik.com', body: 'Footer yok ama uyum kapalı.' })
    expect(r.ok).toBe(true)
  })

  it('settings OKUNAMAZSA varsayılan: uyum AÇIK (footer zorunlu)', async () => {
    settingsThrows = true
    const r = await auditCompliance({ toAddress: 'info@klinik.com', body: 'Footer yok.' })
    expect(r.ok).toBe(false)
    expect(r.failures).toContain('optout_footer_eksik')
  })
})
