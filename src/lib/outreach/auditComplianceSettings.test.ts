import { describe, it, expect, beforeEach, vi } from 'vitest'

// auditCompliance settings dalları: compliance_enabled=false (footer şartı
// düşer) ve settings okuma hatası (varsayılan AÇIK — fail-safe).

let settingsValue: unknown = 'true'
let settingsThrows = false
let suppressionRows: Array<Record<string, unknown>> = []
let suppressionThrows = false
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const filters: Array<(r: Record<string, unknown>) => boolean> = []
      const api: Record<string, unknown> = {}
      const exec = () => {
        if (table === 'settings') {
          if (settingsThrows) throw new Error('db down')
          return { data: { value: settingsValue } }
        }
        if (table === 'suppression_list') {
          if (suppressionThrows) throw new Error('suppression db down')
          return { data: suppressionRows.find((r) => filters.every((f) => f(r))) ?? null }
        }
        return { data: null }
      }
      Object.assign(api, {
        select: () => api,
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api },
        ilike: (c: string, v: string) => { filters.push((r) => String(r[c]).toLowerCase() === v.toLowerCase()); return api },
        limit: () => api,
        maybeSingle: async () => exec(),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
          if (table === 'suppression_list') {
            if (suppressionThrows) return Promise.reject(new Error('suppression db down')).then(res, rej)
            const data = suppressionRows.filter((r) => filters.every((f) => f(r)))
            return Promise.resolve({ data, error: null }).then(res, rej)
          }
          return Promise.resolve({ data: [], error: null }).then(res, rej)
        },
      })
      return api
    },
  },
}))

import { auditCompliance, checkComplianceStatic, isSuppressed, extractDomain, OPT_OUT_MARKER } from './auditCompliance'

const FOOTERLESS = { toAddress: 'a@b.co', body: 'Footer içermeyen gövde.', doNotContact: false }

beforeEach(() => {
  settingsValue = 'true'
  settingsThrows = false
  suppressionRows = []
  suppressionThrows = false
})

describe('auditCompliance — compliance_enabled ayarı', () => {
  it("settings 'false' → opt-out footer şartı DÜŞER (diğer kontroller kalır)", async () => {
    settingsValue = 'false'
    const r = await auditCompliance(FOOTERLESS)
    expect(r.ok).toBe(true)
  })

  it("settings 'true' → footer'sız gövde bloke", async () => {
    const r = await auditCompliance(FOOTERLESS)
    expect(r.ok).toBe(false)
    expect(r.failures).toContain('optout_footer_eksik')
  })

  it('settings okunamazsa varsayılan AÇIK (fail-safe: kontrol gevşemez)', async () => {
    settingsThrows = true
    const r = await auditCompliance(FOOTERLESS)
    expect(r.ok).toBe(false)
    expect(r.failures).toContain('optout_footer_eksik')
  })
})

describe('isSuppressed — scope + FAIL-CLOSED dalları', () => {
  it('email scope eşleşmesi (büyük/küçük harf duyarsız)', async () => {
    suppressionRows.push({ scope: 'email', address: 'kisi@firma.com', reason: 'opt_out' })
    const v = await isSuppressed('KISI@firma.com')
    expect(v.suppressed).toBe(true)
    expect(v.reason).toContain('suppression:email')
  })

  it('domain scope eşleşmesi (adres farklı, domain suppress)', async () => {
    suppressionRows.push({ scope: 'domain', address: 'firma.com', reason: 'bounce' })
    const v = await isSuppressed('baska-kisi@firma.com')
    expect(v.suppressed).toBe(true)
    expect(v.reason).toContain('suppression:domain')
  })

  it('eşleşme yoksa suppressed:false', async () => {
    const v = await isSuppressed('temiz@ok.com')
    expect(v.suppressed).toBe(false)
  })

  it('DB hatasında FAIL-CLOSED: suppressed:true döner (gönderim durur)', async () => {
    suppressionThrows = true
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const v = await isSuppressed('x@y.co')
    expect(v.suppressed).toBe(true)
    expect(v.reason).toContain('fail_closed')
    warnSpy.mockRestore()
  })

  it('domain\'siz adres: email-scope kontrol edilir, domain sorgusu atlanır', async () => {
    const v = await isSuppressed('domainsiz-adres')
    expect(v.suppressed).toBe(false)
  })
})

describe('extractDomain', () => {
  it('kenar durumlar', () => {
    expect(extractDomain(null)).toBeNull()
    expect(extractDomain(undefined)).toBeNull()
    expect(extractDomain('at-isareti-yok')).toBeNull()
    expect(extractDomain('bos@')).toBeNull()
    expect(extractDomain('Ad@Firma.COM')).toBe('firma.com')
  })
})

describe('checkComplianceStatic — saf kontrol dalları', () => {
  it('boş/eksik alıcı adresi', () => {
    expect(checkComplianceStatic({ toAddress: '', body: 'x', complianceEnabled: false, doNotContact: false }).failures)
      .toContain('gecersiz_alici_adresi')
    expect(checkComplianceStatic({ toAddress: 'bozuk-adres', body: 'x', complianceEnabled: false, doNotContact: false }).failures)
      .toContain('gecersiz_alici_adresi')
  })

  it('boş gövde (whitespace dahil)', () => {
    expect(checkComplianceStatic({ toAddress: 'a@b.co', body: '   ', complianceEnabled: true, doNotContact: false }).failures)
      .toContain('bos_govde')
  })

  it('do_not_contact işaretli lead bloke', () => {
    const r = checkComplianceStatic({ toAddress: 'a@b.co', body: `x ${OPT_OUT_MARKER}`, complianceEnabled: true, doNotContact: true })
    expect(r.ok).toBe(false)
    expect(r.failures).toContain('lead_do_not_contact')
  })

  it('tüm koşullar sağlanınca ok', () => {
    const r = checkComplianceStatic({ toAddress: 'a@b.co', body: `x ${OPT_OUT_MARKER}`, complianceEnabled: true, doNotContact: false })
    expect(r.ok).toBe(true)
  })
})
