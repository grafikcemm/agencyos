import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tablo-yönlendirmeli supabase mock'u — suppression_list/settings sorguları.
const tableData: Record<string, unknown[]> = { suppression_list: [], settings: [] }
let suppressionThrows = false

function makeQuery(table: string) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = []
  const obj: Record<string, unknown> = {}
  const chain = () => obj
  Object.assign(obj, {
    select: chain,
    eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return obj },
    ilike: (col: string, val: string) => {
      filters.push((r) => String(r[col]).toLowerCase() === val.toLowerCase()); return obj
    },
    limit: chain,
    maybeSingle: async () => {
      if (table === 'suppression_list' && suppressionThrows) return { data: null, error: { message: 'db down' } }
      const rows = (tableData[table] ?? []).filter((r) => filters.every((f) => f(r as Record<string, unknown>)))
      return { data: rows[0] ?? null, error: null }
    },
    then: (resolve: (v: unknown) => unknown) => {
      if (table === 'suppression_list' && suppressionThrows) {
        return Promise.resolve({ data: null, error: { message: 'db down' } }).then(resolve)
      }
      const rows = (tableData[table] ?? []).filter((r) => filters.every((f) => f(r as Record<string, unknown>)))
      return Promise.resolve({ data: rows, error: null }).then(resolve)
    },
  })
  return obj
}
vi.mock('../supabase', () => ({ supabaseAdmin: { from: (table: string) => makeQuery(table) } }))

import { checkComplianceStatic, isSuppressed, auditCompliance, extractDomain, OPT_OUT_MARKER } from './auditCompliance'

const VALID_BODY = `Merhaba,\n\ndeğer önerisi...\n\n—\nGrafikcem | MERSİS: 123\nBu ileti B2B ticari ileti niteliğindedir.\nBu tür e-postaları almak istemezseniz "ret" yazarak ${OPT_OUT_MARKER}.`

beforeEach(() => {
  tableData.suppression_list = []
  tableData.settings = []
  suppressionThrows = false
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
})
